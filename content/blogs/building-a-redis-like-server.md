# Building a Redis-like Server from First Principles

**16 min read · September 29, 2026 · Source: [Dev-an01/MiniRedis](https://github.com/Dev-an01/MiniRedis)**

My goal with this project was to understand what a key-value server actually
does between `accept()` and the reply going back out on the wire. Instead of
reading the Redis source or reaching for an event-loop library, I built the
server one layer at a time: a framed protocol, a non-blocking event loop, a
hashtable, a serialization format, a balanced tree, sorted sets, timers, TTLs,
and a thread pool.

The result is about 2,300 lines of C++ with no dependencies beyond libc and
pthreads. It speaks a binary protocol on port 1234, stores strings and sorted
sets, expires keys on a millisecond timer, and drops idle connections. It is
not Redis — there is no persistence, no replication, no cluster — but every
mechanism in it is one I had to make work myself.

## Context

A server like this is really three problems stacked on top of each other:

1. **Transport.** TCP gives you a byte stream, not messages. You have to
   invent message boundaries.
2. **Concurrency.** One machine, many clients, and calls that can block.
   Something has to decide who runs next.
3. **Data structures.** Once a request is parsed, `get`, `zquery` and "expire
   this key in 300ms" each want a different index over the same data.

Each one has an obvious answer that falls apart under a small amount of load,
and a less obvious answer that is what real servers do. Building it made the
gap between those two very concrete.

## What I wanted to learn

- Why does a protocol need a length prefix at all?
- What actually breaks with thread-per-connection?
- What does `poll()` give you that blocking reads don't?
- How does a hashtable resize without a latency spike?
- Why send binary tags instead of text?
- How do you get "the 10 members after rank *k*" out of a tree?
- How does one value live in two indexes at once without being copied?
- Where do timers live when the whole server is one loop?
- What has to happen off the event loop, and how do you get it there?

## The architecture

```text
          client.cpp                      server.cpp
   +---------------------+        +-------------------------+
   | build request       |        | poll() readiness loop   |
   | write_all()         |  TCP   |   accept / read / write |
   | read_full(4)        | <----> |   per-conn buffers      |
   | read_full(len)      |        |   parse -> dispatch     |
   | print_response()    |        |   serialize -> outgoing |
   +---------------------+        +-----------+-------------+
                                              |
                     +------------------------+------------------------+
                     |            |            |            |          |
                  HMap db     ZSet (AVL     heap of      DList of   thread
                 (hashtable)   + HMap)      TTLs        idle conns   pool
```

Everything below the event loop is intrusive: the index nodes are embedded
inside the payload structs and recovered with `container_of()`. That single
decision is what lets a value sit in the main hashtable, the TTL heap, and a
sorted set's two indexes simultaneously without any of them owning a copy.

---

## Step 1: A request-response protocol

TCP is a stream of bytes. If a client writes `set k v` and then `get k`, the
server may read both in one `read()`, or the first one split down the middle.
"Read until the buffer is empty" is not a protocol — it's a guess that happens
to work on a loopback socket with one client and breaks everywhere else.

So the first thing is a length prefix. Every message is 4 bytes of little-endian
length followed by exactly that many bytes of body:

```text
+-----+------+
| len | body |
+-----+------+
  4B     len
```

The body of a request is itself a length-prefixed array of strings, because
commands have a variable number of arguments and arguments can contain spaces
and NUL bytes:

```text
+------+-----+------+-----+------+-----+-----+------+
| nstr | len | str1 | len | str2 | ... | len | strn |
+------+-----+------+-----+------+-----+-----+------+
```

The parser is deliberately paranoid. It never trusts a length field to be
inside the buffer:

```cpp
static bool read_u32(const uint8_t *&cur, const uint8_t *end, uint32_t &out) {
    if (cur + 4 > end) {
        return false;
    }
    memcpy(&out, cur, 4);
    cur += 4;
    return true;
}
```

`parse_req()` also rejects an `nstr` above 200,000 before allocating anything,
and rejects trailing garbage after the last string. A client that sends a
declared length of 4 GB should cost the server one rejected read, not 4 GB of
`std::vector` growth.

Both sides cap a message at 32 MiB (`k_max_msg`). The client originally used a
4 KiB stack buffer, which meant a large `keys` reply was rejected as "too long"
by the receiver rather than by the sender — the two ends disagreed about the
limit. It now sizes its buffers from the header it just read:

```cpp
uint32_t len = 0;
memcpy(&len, header, 4);
if (len > k_max_msg) {
    msg("too long");
    return -1;
}
std::vector<char> rbuf(len);
err = read_full(fd, rbuf.data(), len);
```

A fixed buffer would have to be 32 MiB of stack to be correct, which is its own
problem. Reading the length first and allocating to fit is both smaller and
right — and it's only safe because the length was bounds-checked first.

## Step 2: Choosing a concurrency model

The textbook first server is one thread per connection:

```text
accept() --> spawn thread --> read() blocks --> handle --> write() --> repeat
```

It is easy to write and easy to reason about, which is why it is the first
thing everyone builds. It has two problems that show up at different scales.

The small one is cost: each thread wants its own stack, and the kernel
schedules all of them. Ten thousand idle connections become ten thousand mostly
sleeping threads.

The big one is that it puts the data behind a lock. A key-value store is shared
mutable state. The moment two threads can run `do_set()` at once, every
hashtable, every tree rotation and every heap swap needs synchronization —
and now the hard part of the project is concurrency bugs rather than data
structures.

The alternative is to stop letting a slow client block anything. Put every
socket in non-blocking mode, ask the kernel which ones are ready, and service
only those, all on one thread:

```cpp
static void fd_set_nb(int fd) {
    int flags = fcntl(fd, F_GETFL, 0);
    flags |= O_NONBLOCK;
    (void)fcntl(fd, F_SETFL, flags);
}
```

A non-blocking `read()` on a socket with no data returns `-1` with `EAGAIN`
instead of sleeping. That turns "wait for this client" into "come back to this
client later", which is exactly what a scheduler needs to hear.

The trade-off is explicit state. A blocking handler keeps its progress on the
thread's stack; an event-driven one has to write that progress down. That is
what `struct Conn` is:

```cpp
struct Conn {
    int fd = -1;
    bool want_read = false;
    bool want_write = false;
    bool want_close = false;
    Buffer incoming;    // data to be parsed by the application
    Buffer outgoing;    // responses generated by the application
    uint64_t last_active_ms = 0;
    DList idle_node;
};
```

A single-threaded loop also buys something valuable for free: every command
handler runs to completion with exclusive access to the database. No locks
appear anywhere in this project until Step 11, and even then they guard the
thread pool's queue, not the data.

## Step 3: The event loop

The loop has four phases, and the ordering matters more than any individual
part.

```text
build pollfd[] from each conn's intent
        |
        v
poll(fds, timeout = next_timer_ms())
        |
        +--> listening fd ready?  -> handle_accept()
        |
        +--> for each ready conn  -> touch idle timer
        |                            handle_read() / handle_write()
        |                            destroy if POLLERR or want_close
        |
        +--> process_timers()
```

The readiness flags come from the application's intent, not from a fixed mask.
A connection that has a pending response asks for `POLLOUT`; one waiting for a
command asks for `POLLIN`:

```cpp
struct pollfd pfd = {conn->fd, POLLERR, 0};
if (conn->want_read)  { pfd.events |= POLLIN; }
if (conn->want_write) { pfd.events |= POLLOUT; }
```

Two details in the read path are worth calling out.

**Pipelining.** After a read, the server parses in a loop, not once:

```cpp
while (try_one_request(conn)) {}
```

One `read()` can deliver several complete requests, and consuming only the
first would leave the rest sitting in the buffer with nothing to wake the loop
up — the client is waiting for a reply, so no new data arrives. The loop drains
whatever arrived. Correspondingly, `buf_consume()` removes exactly the bytes of
one message rather than clearing the buffer, because the tail may be half of
the next request.

**The speculative write.** Having produced a response, the server doesn't wait
for the next `poll()` to say the socket is writable — it just tries:

```cpp
if (conn->outgoing.size() > 0) {
    conn->want_read = false;
    conn->want_write = true;
    return handle_write(conn);
}
```

For a request-response protocol the socket is almost always writable, so this
saves a full loop iteration per request. If it isn't ready, the non-blocking
write returns `EAGAIN`, the function returns, and `POLLOUT` handles it next
time round. The optimization is safe precisely because the failure case is
already the normal path.

`poll()` itself is the known ceiling here. It is O(n) per iteration: the whole
`pollfd` array is rebuilt and rescanned every time round the loop, even if one
connection is active out of ten thousand. `epoll` / `kqueue` fix that by
keeping the interest set in the kernel. For this project `poll()` is portable
and short, and it is the piece I would replace first if connection counts grew.

## Step 4: The key-value server

With framing and a loop in place, the actual database is small. A command is a
`vector<string>`, dispatch is a chain of comparisons on arity and name, and
every handler writes into the connection's outgoing buffer:

```cpp
if (cmd.size() == 2 && cmd[0] == "get") {
    return do_get(cmd, out);
} else if (cmd.size() == 3 && cmd[0] == "set") {
    return do_set(cmd, out);
}
```

Checking `cmd.size()` before the name means a malformed `set` with one argument
falls through to "unknown command" instead of indexing past the end of the
vector. Arity is part of the command's identity.

The value type is a single struct with a tag:

```cpp
struct Entry {
    struct HNode node;      // hashtable node
    std::string key;
    size_t heap_idx = -1;   // index into the TTL heap, or -1
    uint32_t type = 0;      // T_STR or T_ZSET
    std::string str;
    ZSet zset;
};
```

This wastes a little memory — every entry carries both a `std::string` and a
`ZSet` — but it makes type checking trivial and keeps the lifetime rules in one
place. `do_get()` on a sorted set returns `ERR_BAD_TYP` rather than reading
whichever field happens to be there.

One small trick recurs in every handler. The lookup key is a stack struct that
borrows the argument string:

```cpp
LookupKey key;
key.key.swap(cmd[1]);
key.node.hcode = str_hash((uint8_t *)key.key.data(), key.key.size());
HNode *node = hm_lookup(&g_data.db, &key.node, &entry_eq);
```

`swap` instead of assignment means no allocation on the lookup path, and on
insert the same buffer is swapped again into the new `Entry`. The command
vector is dead after the handler returns, so moving out of it is free.

## Step 5: Hashtables without the latency spike

The hashtable is chaining over a power-of-two array, which makes the slot index
a mask rather than a modulo:

```cpp
size_t pos = node->hcode & htab->mask;
```

Lookup returns **the address of the pointer that points at the node**, not the
node:

```cpp
static HNode **h_lookup(HTab *htab, HNode *key, bool (*eq)(HNode *, HNode *)) {
    size_t pos = key->hcode & htab->mask;
    HNode **from = &htab->tab[pos];     // incoming pointer to the target
    for (HNode *cur; (cur = *from) != NULL; from = &cur->next) {
        if (cur->hcode == key->hcode && eq(cur, key)) {
            return from;
        }
    }
    return NULL;
}
```

That one indirection removes the special case for deleting the head of a chain.
Detaching is `*from = node->next` whether `from` points at an array slot or at
a previous node's `next` field. The comparison also checks `hcode` before
calling `eq()`, so a full key comparison only happens on a hash match.

The interesting part is resizing. The naive version allocates a bigger array
and moves every key at once — which means one unlucky `set` out of a million
takes a hundred milliseconds while a few million keys are rehashed, and during
that time the server answers nothing. For a database that is a latency cliff,
and it is exactly the sort of thing that shows up as a mysterious p99.

So the resize is incremental. The map holds two tables:

```cpp
struct HMap {
    HTab newer;
    HTab older;
    size_t migrate_pos = 0;
};
```

When the load factor passes 8, the current table is demoted to `older` and a
new table twice the size becomes `newer`. From then on, every lookup, insert
and delete also moves up to 128 keys across:

```cpp
static void hm_help_rehashing(HMap *hmap) {
    size_t nwork = 0;
    while (nwork < k_rehashing_work && hmap->older.size > 0) {
        HNode **from = &hmap->older.tab[hmap->migrate_pos];
        if (!*from) {
            hmap->migrate_pos++;
            continue;   // empty slot
        }
        h_insert(&hmap->newer, h_detach(&hmap->older, from));
        nwork++;
    }
    if (hmap->older.size == 0 && hmap->older.tab) {
        free(hmap->older.tab);
        hmap->older = HTab{};
    }
}
```

The cost is spread across the operations that caused the growth. The price is
that during a migration every read has to check both tables, and inserts always
go to `newer` so the older table only ever shrinks. Worst-case latency drops
from "rehash the world" to a bounded 128 moves — the total work is the same, it
just stops arriving all at once.

## Step 6: Data serialization

The reply format could have been text. Redis's own protocol is largely
line-based, and it is much easier to debug with `telnet`. I went binary because
I wanted the client to be able to reconstruct types without parsing, and
because nested arrays in a text protocol need escaping rules I didn't want to
invent.

Every value is a one-byte tag plus a payload:

| Tag | Type | Payload |
| --- | --- | --- |
| 0 | nil | — |
| 1 | err | `u32` code, `u32` len, bytes |
| 2 | str | `u32` len, bytes |
| 3 | int | `i64` |
| 4 | dbl | `double` |
| 5 | arr | `u32` count, then that many tagged values |

Because an array declares a count and each element is self-describing, values
nest to any depth and the decoder is a recursive function with no lookahead.
Strings carry a length rather than a terminator, so a value containing a NUL or
a newline needs no escaping at all.

The awkward case is an array whose length isn't known until it has been built —
`zquery` doesn't know how many members it will emit until it stops. The fix is
to reserve the space and backfill it:

```cpp
static size_t out_begin_arr(Buffer &out) {
    out.push_back(TAG_ARR);
    buf_append_u32(out, 0);     // filled by out_end_arr()
    return out.size() - 4;      // the `ctx` arg
}
static void out_end_arr(Buffer &out, size_t ctx, uint32_t n) {
    assert(out[ctx - 1] == TAG_ARR);
    memcpy(&out[ctx], &n, 4);
}
```

The same pattern wraps the whole response: `response_begin()` reserves four
bytes for the message length, the handler appends whatever it wants, and
`response_end()` writes the final size back. It also enforces the cap there —
if a handler produced more than 32 MiB, the buffer is truncated back to the
header and replaced with an `ERR_TOO_BIG` error rather than sending a message
the client will reject anyway.

Writing the reply straight into the connection's outgoing buffer means there is
no intermediate response object and no second copy. The trade-off is that a
handler cannot change its mind cheaply — hence the explicit truncate-and-
replace in `response_end()`.

## Step 7: A balanced binary tree

Sorted sets need range queries, so a hashtable isn't enough; the members have to
be kept in order. I used an AVL tree — strict balance, O(log n) worst case, and
rebalancing that is a handful of pointer rewrites.

Two fields hang off each node:

```cpp
struct AVLNode {
    AVLNode *parent = NULL;
    AVLNode *left = NULL;
    AVLNode *right = NULL;
    uint32_t height = 0;    // subtree height
    uint32_t cnt = 0;       // subtree size
};
```

`height` drives rebalancing. `cnt` — the number of nodes in this subtree — is
what makes rank queries possible, and it's the field that turns a plain
ordered container into something a `zquery` can use. Both are recomputed by one
function after every structural change:

```cpp
static void avl_update(AVLNode *node) {
    node->height = 1 + max(avl_height(node->left), avl_height(node->right));
    node->cnt = 1 + avl_cnt(node->left) + avl_cnt(node->right);
}
```

Rebalancing is the standard pair of rotations, with the double-rotation case
handled by rotating the inner child first:

```cpp
static AVLNode *avl_fix_left(AVLNode *node) {
    if (avl_height(node->left->left) < avl_height(node->left->right)) {
        node->left = rot_left(node->left);  // Transformation 2
    }
    return rot_right(node);                 // Transformation 1
}
```

The part I found genuinely interesting is `avl_offset()`. Given a node and a
signed offset, it walks to the node that many positions away **in sorted
order**, in O(log n), using `cnt` to decide whether the target is inside a
subtree or up past the parent:

```cpp
AVLNode *avl_offset(AVLNode *node, int64_t offset) {
    int64_t pos = 0;    // the rank difference from the starting node
    while (offset != pos) {
        if (pos < offset && pos + avl_cnt(node->right) >= offset) {
            node = node->right;                 // target is in the right subtree
            pos += avl_cnt(node->left) + 1;
        } else if (pos > offset && pos - avl_cnt(node->left) <= offset) {
            node = node->left;                  // target is in the left subtree
            pos -= avl_cnt(node->right) + 1;
        } else {
            AVLNode *parent = node->parent;     // neither: go up
            if (!parent) {
                return NULL;
            }
            pos += (parent->right == node) ? -(int64_t)(avl_cnt(node->left) + 1)
                                           :  (int64_t)(avl_cnt(node->right) + 1);
            node = parent;
        }
    }
    return node;
}
```

It maintains a running rank difference and never restarts from the root, so
"skip 50,000 members" costs a tree walk rather than 50,000 successor steps.
Walking with parent pointers instead of recursion also means no stack and no
allocation.

This is the piece I trusted least, so it gets the most testing: `test_avl.cpp`
mirrors every insert and delete into a `std::multiset` and re-verifies height,
`cnt`, and parent links across the whole tree after each operation.
`test_offset.cpp` checks every offset from every node for trees of size 1
through 200.

## Step 8: Sorted sets

A sorted set has to answer two different questions fast: "what is the score of
member X" and "give me everything at or after (score, name)". One index can't
do both well, so a `ZSet` keeps two, over the same nodes:

```cpp
struct ZSet {
    AVLNode *root = NULL;   // index by (score, name)
    HMap hmap;              // index by name
};

struct ZNode {
    AVLNode tree;
    HNode   hmap;
    double  score = 0;
    size_t  len = 0;
    char    name[0];        // flexible array
};
```

Each `ZNode` embeds a tree node and a hashtable node. There is exactly one
allocation per member, sized to fit the name inline:

```cpp
ZNode *node = (ZNode *)malloc(sizeof(ZNode) + len);
```

This is what the intrusive style buys. The name is stored once, not once per
index, and both indexes reach the same object through `container_of()`.

Ordering is by the `(score, name)` tuple, with the name as tiebreaker so that
equal scores still have a total order — without it, seeking to a score would be
ambiguous and paging through results could repeat or skip members:

```cpp
static bool zless(AVLNode *lhs, double score, const char *name, size_t len) {
    ZNode *zl = container_of(lhs, ZNode, tree);
    if (zl->score != score) {
        return zl->score < score;
    }
    int rv = memcmp(zl->name, name, min(zl->len, len));
    if (rv != 0) {
        return rv < 0;
    }
    return zl->len < len;
}
```

Updating a score is a detach-and-reinsert rather than an in-place edit, because
the score is part of the tree's sort key and changing it under the tree would
corrupt the ordering:

```cpp
static void zset_update(ZSet *zset, ZNode *node, double score) {
    if (node->score == score) {
        return;
    }
    zset->root = avl_del(&node->tree);
    avl_init(&node->tree);
    node->score = score;
    tree_insert(zset, node);
}
```

The hashtable index is untouched by that, since the name didn't change.

`zquery` then composes the two previous steps: `zset_seekge()` descends the
tree recording the last node that wasn't less than the key, `znode_offset()`
jumps by rank, and a bounded loop emits pairs:

```cpp
ZNode *znode = zset_seekge(zset, score, name.data(), name.size());
znode = znode_offset(znode, offset);

size_t ctx = out_begin_arr(out);
int64_t n = 0;
while (znode && n < limit) {
    out_str(out, znode->name, znode->len);
    out_dbl(out, znode->score);
    znode = znode_offset(znode, +1);
    n += 2;
}
out_end_arr(out, ctx, (uint32_t)n);
```

A missing key is treated as an empty sorted set rather than an error, via a
shared `k_empty_zset` — so `zquery` on a key that doesn't exist returns an
empty array, which is what a client iterating a range expects.

## Step 9: Timers and timeouts

A connection that opens and then says nothing holds an fd forever. The server
needs to close idle connections, which means the event loop needs a notion of
time.

`poll()` already takes a timeout, so the mechanism is there. The question is
what to pass. The answer has to be the time until the *earliest* pending
deadline — too long and timers fire late, too short and the loop spins.

For idle timeouts there is a trick that avoids scanning connections: every time
a connection does anything, move it to the back of a linked list.

```cpp
conn->last_active_ms = get_monotonic_msec();
dlist_detach(&conn->idle_node);
dlist_insert_before(&g_data.idle_list, &conn->idle_node);
```

The list is therefore always sorted by last-active time, so the head is always
the next connection to expire. Finding the next deadline is O(1) and expiring
is a walk from the front that stops at the first live one:

```cpp
while (!dlist_empty(&g_data.idle_list)) {
    Conn *conn = container_of(g_data.idle_list.next, Conn, idle_node);
    uint64_t next_ms = conn->last_active_ms + k_idle_timeout_ms;
    if (next_ms >= now_ms) {
        break;  // not expired
    }
    conn_destroy(conn);
}
```

The list is intrusive again — `DList idle_node` lives inside `Conn`, so there
is no allocation per timer and detaching is four pointer writes.

One detail that matters: all of this uses `CLOCK_MONOTONIC`, not wall time.

```cpp
static uint64_t get_monotonic_msec() {
    struct timespec tv = {0, 0};
    clock_gettime(CLOCK_MONOTONIC, &tv);
    return uint64_t(tv.tv_sec) * 1000 + tv.tv_nsec / 1000 / 1000;
}
```

Wall time can jump backwards — NTP correction, a manual clock change — and a
backwards jump on a wall-clock timer means every pending timeout silently stops
firing until the clock catches up. A monotonic clock only moves forward.

## Step 10: Cache expiration with TTLs

Idle timeouts work on a list because they're all the same duration, so
activity order equals expiry order. TTLs aren't: `pexpire a 10000` followed by
`pexpire b 5` must expire `b` first. Insertion order tells you nothing, so a
list would need a sorted insert — O(n) per `pexpire`.

The structure that gives "smallest deadline" in O(1) and insert/update in
O(log n) is a binary min-heap, which is just an array:

```cpp
struct HeapItem {
    uint64_t val = 0;   // absolute expiry, monotonic ms
    size_t *ref = NULL; // points back at Entry::heap_idx
};
```

The `ref` field is the part that makes it usable. A plain heap can only pop the
minimum, but `pexpire` on an existing key has to *find and update* an item in
the middle, and `del` has to remove one. So each item holds a pointer back to
the owning `Entry`'s `heap_idx` field, and every swap inside the heap updates
it:

```cpp
static void heap_up(HeapItem *a, size_t pos) {
    HeapItem t = a[pos];
    while (pos > 0 && a[heap_parent(pos)].val > t.val) {
        a[pos] = a[heap_parent(pos)];
        *a[pos].ref = pos;              // keep the back-reference in sync
        pos = heap_parent(pos);
    }
    a[pos] = t;
    *a[pos].ref = pos;
}
```

An `Entry` therefore always knows its own heap position, and setting or
clearing a TTL is a direct index rather than a search:

```cpp
static void entry_set_ttl(Entry *ent, int64_t ttl_ms) {
    if (ttl_ms < 0 && ent->heap_idx != (size_t)-1) {
        heap_delete(g_data.heap, ent->heap_idx);    // negative TTL removes it
        ent->heap_idx = -1;
    } else if (ttl_ms >= 0) {
        uint64_t expire_at = get_monotonic_msec() + (uint64_t)ttl_ms;
        HeapItem item = {expire_at, &ent->heap_idx};
        heap_upsert(g_data.heap, ent->heap_idx, item);
    }
}
```

`heap_update()` decides direction by comparing against the parent, so the same
call handles a TTL being extended or shortened.

Both timer sources feed one timeout:

```cpp
static uint32_t next_timer_ms() {
    uint64_t next_ms = (uint64_t)-1;
    if (!dlist_empty(&g_data.idle_list)) {
        Conn *conn = container_of(g_data.idle_list.next, Conn, idle_node);
        next_ms = conn->last_active_ms + k_idle_timeout_ms;
    }
    if (!g_data.heap.empty() && g_data.heap[0].val < next_ms) {
        next_ms = g_data.heap[0].val;
    }
    if (next_ms == (uint64_t)-1) { return -1; }     // no timers, block forever
    if (next_ms <= now_ms)       { return 0; }      // already due
    return (int32_t)(next_ms - now_ms);
}
```

Then reaping is bounded:

```cpp
const size_t k_max_works = 2000;
while (!heap.empty() && heap[0].val < now_ms) {
    Entry *ent = container_of(heap[0].ref, Entry, heap_idx);
    hm_delete(&g_data.db, &ent->node, &hnode_same);
    entry_del(ent);
    if (nworks++ >= k_max_works) {
        break;  // don't stall the server if too many keys expire at once
    }
}
```

That cap is the same instinct as incremental rehashing: if a million keys share
an expiry timestamp, the server should get slightly behind on expiry rather
than stop answering requests for a second. Keys expire a few milliseconds late;
nobody notices. A frozen server, everybody notices.

Note `container_of(heap[0].ref, Entry, heap_idx)` — the back-reference is a
pointer to a *field*, so the same macro recovers the whole `Entry` from it.

## Step 11: A thread pool for the slow path

One thread means one slow operation stalls everything, and there is a specific
operation here that can be slow: freeing a large sorted set. Deleting a zset
with a million members walks a million tree nodes and calls `free()` a million
times. All of that happens inside `do_del()`, inside the event loop.

It is also, unusually, work that has no result anyone is waiting for. The key
is already unlinked from the database the moment `hm_delete()` returns — no
client can reach that memory again. Reclaiming it is pure bookkeeping, and
bookkeeping is exactly what can happen on another thread.

The pool is the minimum that works: N pthreads, a `std::deque` of work items, a
mutex, a condition variable.

```cpp
static void *worker(void *arg) {
    TheadPool *tp = (TheadPool *)arg;
    while (true) {
        pthread_mutex_lock(&tp->mu);
        while (tp->queue.empty()) {
            pthread_cond_wait(&tp->not_empty, &tp->mu);
        }
        Work w = tp->queue.front();
        tp->queue.pop_front();
        pthread_mutex_unlock(&tp->mu);

        w.f(w.arg);     // do the work outside the lock
    }
    return NULL;
}
```

Two things are deliberate. The wait is a `while`, not an `if`, because
`pthread_cond_wait` can wake spuriously and because another worker may have
taken the item first. And the work runs *after* the unlock, so a slow job
doesn't block the queue.

The decision to offload is a size check, because handing a small job to another
thread costs more in context switches than doing it inline:

```cpp
static void entry_del(Entry *ent) {
    entry_set_ttl(ent, -1);     // unlink from the TTL heap first
    size_t set_size = (ent->type == T_ZSET) ? hm_size(&ent->zset.hmap) : 0;
    const size_t k_large_container_size = 1000;
    if (set_size > k_large_container_size) {
        thread_pool_queue(&g_data.thread_pool, &entry_del_func, ent);
    } else {
        entry_del_sync(ent);    // small; avoid context switches
    }
}
```

The ordering in that function is the safety property. The TTL heap entry is
removed **on the event loop thread**, before the `Entry` is handed over.
Otherwise a worker could be freeing the entry while `process_timers()` reads
its `heap_idx`. Once queued, the entry is unreachable from every shared
structure, so the worker touches memory nobody else can see — which is why this
pool needs no locks around the database itself.

That constraint is also the pool's limit. It can only ever run work that has
been fully detached from shared state. Running a *command* on a worker would
require locking the hashtable, and that is a different project.

## Testing

Each data structure is tested against a `std::` container that is obviously
correct, rather than against my own expectations:

- `test_avl.cpp` — inserts and deletes mirrored into a `std::multiset`, with a
  full structural verification (height, `cnt`, parent links, ordering) after
  every single operation.
- `test_offset.cpp` — every offset from every node, for trees of size 1..200.
- `test_heap.cpp` — heap operations mirrored into a `std::multimap`, checking
  the heap property and that every item's back-reference matches its index.
- `test_cmds.py` — end-to-end, running the real client against a real server
  and diffing stdout against expected transcripts.

```bash
make test
```

The structural checks are the ones that earned their keep. A balanced tree with
a corrupt `cnt` still returns correct lookups — it only produces wrong answers
later, in `zquery`, in a way that looks like a query bug.

## The stack and why I chose it

- **C++ as C-with-containers.** `std::vector`, `std::string` and `std::deque`
  for the boring parts; raw structs, `malloc` and intrusive nodes everywhere
  the layout matters.
- **`poll()`** rather than `epoll` or `kqueue`, because it is portable and
  short. The O(n) rescan is the price.
- **pthreads** directly rather than `std::thread`, because the pool needs a
  condition variable and a mutex and nothing else.
- **No dependencies.** The point of the project was the mechanisms.

## What I learned

### Framing is the protocol

Almost every "it works locally but breaks under load" networking bug I have
seen is an assumption that a read returns exactly one message. Length prefixes
make that impossible to get wrong, and they cost four bytes.

### Amortization beats raw speed

The two most interesting decisions — incremental rehashing and the 2000-key
expiry cap — don't make anything faster in total. They just refuse to do all
the work at once. For a server, bounded worst-case latency is worth more than
better average throughput.

### Intrusive structures are how one value lives in many indexes

`container_of()` looks like a hack the first time you see it. But it is what
lets an `Entry` be in a hashtable and a heap, and a `ZNode` be in a tree and a
hashtable, with one allocation and no copies. The back-pointer from a heap item
to `Entry::heap_idx` is the same idea applied in reverse.

### Single-threaded is a feature until it isn't

Not having locks removed an entire category of bug and made every data
structure simpler to write and test. The thread pool exists only for work that
is provably unreachable from shared state — and staying on the right side of
that line is what keeps the rest lock-free.

### Test invariants, not outputs

Checking that `get` returns what `set` stored catches very little. Checking
that every node's `cnt` equals its subtree size after every rotation catches
the bugs that would otherwise surface hours later as a wrong range query.

### Choose the clock deliberately

Monotonic versus wall time is a one-line decision that determines whether the
server survives an NTP correction.

## What I would improve next

1. **Replace `poll()` with `epoll`/`kqueue`.** The rebuild-and-rescan is the
   first thing that breaks at high connection counts.
2. **Make the port and idle timeout configurable.** Both are hardcoded.
3. **Propagate allocation failure.** `znode_new()` now aborts on a failed
   `malloc` instead of asserting — `assert()` compiles out under `NDEBUG`,
   which would have let a NULL fall through into a `memcpy`. Aborting is
   correct but blunt; a real server would return an error to the client.
4. **Add persistence.** An append-only log of mutations would be the smallest
   thing that makes the data survive a restart.
5. **More value types.** Lists and hashes would exercise whether the `Entry`
   tagged-union layout actually scales or needs a real polymorphic value.
6. **Benchmark it.** Everything above is reasoning about latency; none of it is
   measured yet.

## Final thoughts

The most useful part of this project wasn't any single data structure. It was
seeing how much of a database is really about *refusing to do work all at
once* — rehashing 128 keys at a time, capping expiry at 2000 per pass, handing
a large free to another thread, servicing only the sockets the kernel says are
ready.

None of those are clever algorithms. They are all the same instinct applied in
different places: find the operation that occasionally takes a long time, and
break it up before it takes the server down with it.

That is the core loop, built one understandable layer at a time.
