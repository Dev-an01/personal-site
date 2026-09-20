# Building a Movie RAG Search Engine from First Principles

**14 min read · September 17, 2026 · Source: this repository**

My goal with this project was to learn how Retrieval-Augmented Generation works by building the retrieval layer myself. Instead of starting with a framework or a hosted vector database, I built a movie search engine one piece at a time: keyword search, BM25, dense embeddings, hybrid ranking, reranking, and finally an LLM-generated answer grounded in the retrieved movies.

The result is a command-line RAG project that searches 5,000 movies from natural-language prompts. A query such as “a lonely astronaut trying to survive” does not need to share every word with a movie description. Semantic search can retrieve conceptually related movies, while BM25 preserves exact matches for titles and distinctive keywords.

## Context

RAG stands for Retrieval-Augmented Generation. It separates an answer into two jobs:

1. **Retrieval** finds documents that are likely to contain useful information.
2. **Generation** gives those documents to a language model so it can write a useful response.

That separation matters. A language model has broad language skills, but it does not automatically know which records exist in my movie collection. Retrieval gives it a small, relevant slice of the collection at request time.

For this project, each document is a movie with three fields:

```json
{
  "id": 1,
  "title": "Example Movie",
  "description": "A short plot description used for search."
}
```

The current local dataset contains 5,000 movies. It is large enough to make ranking meaningful but small enough to inspect, cache, and search on one machine.

## What I wanted to learn

I wanted to answer a few practical questions:

- What does an inverted index actually store?
- Why is BM25 better than counting keyword matches?
- What does an embedding add that keyword search cannot?
- How can two very different ranking systems be combined?
- Where do query rewriting and reranking fit?
- What turns a search engine into a RAG system?
- How can I tell whether a retrieval change is actually better?

Building each layer made the answers much clearer than connecting a framework and treating retrieval as a black box.

## The architecture

There are two main flows: preparing local search artifacts and answering a query.

### Indexing flow

```text
movies.json
   |
   +--> tokenize + stem --------------------> inverted index + BM25 statistics
   |
   +--> split descriptions into chunks ----> MiniLM embeddings + chunk metadata
```

The project stores generated artifacts as Pickle, NumPy, and JSON files in `cache/`. This is intentionally simple. At 5,000 movies, I do not need a separate vector database to learn the retrieval concepts.

### Query flow

```text
Natural-language query
   |
   +--> optional spell correction / rewrite / expansion
   |
   +--> BM25 ranking -----------------------+
   |                                       |
   +--> query embedding + cosine ranking ---+--> hybrid fusion
                                                   |
                                                   +--> optional reranking
                                                   |
                                                   +--> top movie documents
                                                             |
                                                             +--> LLM prompt
                                                                   |
                                                                   +--> answer
```

The retrieval path works locally. OpenRouter is only needed for LLM-backed query enhancement, LLM reranking, evaluation by an LLM, and answer generation.

## Step 1: Normalize the text

Keyword retrieval starts by making text easier to compare. The project:

1. converts text to lowercase;
2. removes punctuation;
3. splits the text into tokens;
4. removes stop words; and
5. applies Porter stemming.

The relevant code lives in `cli/lib/text_utils.py`.

```python
def tokenize_text(text: str) -> list[str]:
    text = preprocess_text(text)
    tokens = text.split()
    valid_tokens = remove_stopwords(tokens, load_stopwords())
    return stem_tokens(valid_tokens)
```

Stemming reduces related forms such as “adventure” and “adventures” toward a shared representation. It is not linguistically perfect, but it makes a small lexical search engine more forgiving.

The trade-off is that normalization discards information. Exact punctuation and some word forms disappear. That is acceptable for this learning project, but it is one reason lexical search should not be the only retrieval method.

## Step 2: Build an inverted index

An inverted index maps a term to the documents that contain it. Instead of scanning every movie for every query, the search engine can jump directly from a query token to matching document IDs.

Conceptually, it looks like this:

```text
space      -> {4, 19, 87, ...}
survival   -> {19, 52, 104, ...}
romance    -> {7, 21, 33, ...}
```

The `InvertedIndex` also stores:

- the length of every document;
- the frequency of each term inside each document; and
- a mapping from internal document IDs to movie titles.

Those extra statistics make TF-IDF and BM25 possible.

## Step 3: Rank exact matches with BM25

A raw keyword match only tells me that a word appeared. BM25 gives me a relevance score.

It rewards a term when:

- the term appears several times in a document;
- the term is rare across the collection; and
- the document is not receiving an unfair advantage just because it is long.

This project uses `k1 = 1.5` and `b = 0.75`. `k1` controls how quickly repeated occurrences stop adding value. `b` controls document-length normalization.

BM25 is especially useful when the query contains an exact title, character, actor, or unusual phrase. If someone searches for “Paddington,” lexical retrieval should not lose that signal merely because another description is semantically similar to family adventures.

A local search can be run with:

```bash
uv run python cli/keyword_search_cli.py bm25search "space adventure"
```

## Step 4: Represent meaning with embeddings

Lexical search compares words. Semantic search compares numerical representations of meaning.

An embedding model converts text into a vector: a list of numbers positioned in a high-dimensional space. Texts with related meanings tend to land closer together. This lets a query such as “a person stranded on another planet” retrieve descriptions about isolation, survival, and space even when they do not repeat the exact query.

The project uses `sentence-transformers/all-MiniLM-L6-v2` for text embeddings. NumPy stores the vectors and computes cosine similarity.

```python
def cosine_similarity(vec1: np.ndarray, vec2: np.ndarray) -> float:
    dot_product = np.dot(vec1, vec2)
    norm1 = np.linalg.norm(vec1)
    norm2 = np.linalg.norm(vec2)

    if norm1 == 0 or norm2 == 0:
        return 0.0

    return dot_product / (norm1 * norm2)
```

Cosine similarity compares vector direction rather than raw magnitude. A higher score means the query and document point in more similar semantic directions.

## Step 5: Chunk movie descriptions

Embedding an entire document can blur useful details. A movie description may mention its setting, characters, conflict, and tone. Only one part may match the query.

The `ChunkedSemanticSearch` class splits each description into overlapping groups of sentences. It embeds every chunk, compares the query with every chunk, and keeps the best chunk score for each movie.

```text
Movie description
   |
   +--> chunk 1 --> embedding --+
   +--> chunk 2 --> embedding ---+--> best score represents the movie
   +--> chunk 3 --> embedding --+
```

The current defaults use four sentences per semantic chunk and one sentence of overlap. Overlap protects information that falls near a chunk boundary.

This improves local matching, but it has a cost: the current cache contains far more chunk vectors than movie vectors. The chunk embedding file is about 107 MB for the 5,000-movie dataset, compared with about 7.3 MB for whole-movie embeddings.

## Step 6: Combine lexical and semantic retrieval

Neither retrieval method wins every time.

BM25 is strong when wording matters. Semantic search is strong when intent matters. Hybrid retrieval combines them.

The project supports two fusion strategies.

### Weighted score fusion

The first method normalizes BM25 and semantic scores into the same range and computes:

```text
hybrid_score = alpha * bm25_score + (1 - alpha) * semantic_score
```

With `alpha = 0.5`, both systems contribute equally. A higher alpha favors lexical matches; a lower alpha favors semantic similarity.

This method is intuitive, but score normalization can be unstable because BM25 and cosine similarity have different distributions.

### Reciprocal Rank Fusion

Reciprocal Rank Fusion, or RRF, combines positions rather than raw scores:

```text
rrf_score = 1 / (k + rank)
```

If a movie appears in both ranked lists, it receives a contribution from both. The project defaults to `k = 60`.

RRF is the default choice for the RAG path because ranks are easier to combine than two unrelated score scales.

```bash
uv run python cli/hybrid_search_cli.py rrf-search \
  "dream inside a dream" --k 60 --limit 5
```

## Step 7: Improve difficult queries

Users do not write clean benchmark queries. They misspell titles, describe half-remembered scenes, and use vocabulary that never appears in the dataset.

The project supports three LLM-powered query transformations:

- **Spell correction** changes only high-confidence typos.
- **Rewriting** turns a vague memory into a short, searchable phrase.
- **Expansion** appends related terms that may appear in descriptions.

For example:

```text
that bear movie where leo gets attacked
                    |
                    v
The Revenant Leonardo DiCaprio bear attack
```

Query enhancement can help retrieval, but it can also change the user’s intent. That is why it is optional and why the original query should remain visible in a future UI.

## Step 8: Rerank the candidate set

Hybrid search is fast enough to find candidates, but the first result is not always the best result. Reranking spends more computation on a smaller list.

The project has three reranking experiments:

1. **Individual LLM scoring** asks an LLM to score each candidate from 0 to 10.
2. **Batch LLM ranking** gives the candidate list to an LLM and requests movie IDs in relevance order.
3. **Cross-encoder ranking** uses `cross-encoder/ms-marco-TinyBERT-L2-v2` to score each query-document pair locally.

The hybrid CLI retrieves five times the requested result count when reranking is enabled, reranks that larger pool, and then returns the requested number.

This is a common retrieve-then-rerank pattern:

```text
large collection --> cheap retrieval --> 25 candidates --> expensive reranker --> top 5
```

The lesson is that retrieval and ranking are different stages. The first stage protects recall by finding enough plausible candidates. The second stage improves precision by comparing those candidates more carefully.

## Step 9: Add generation

At this point, the project is a hybrid search engine. It becomes RAG when the retrieved movies are placed into an LLM prompt.

The `rag` command:

1. loads the movies;
2. runs RRF hybrid search;
3. selects the top five results;
4. formats each title and description as context;
5. sends the query and context to OpenRouter; and
6. prints both the retrieved titles and the generated answer.

```bash
uv run python cli/augmented_generation_cli.py rag \
  "What should I watch if I like mind-bending thrillers?"
```

The same CLI also explores three related tasks:

- `summarize` synthesizes several retrieved movies;
- `citations` asks the model to cite numbered retrieved documents; and
- `question` answers conversationally from the selected movies.

The important part is not the exact prompt. The important part is that retrieval happens first and the chosen records remain visible. That makes it possible to inspect whether a poor answer began with poor retrieval or with poor generation.

## Step 10: Search with an image

Text is not the only possible query.

The multimodal path uses `clip-ViT-B-32`, which can encode images and text into a compatible space. The project embeds every movie’s title and description as text, embeds an input image, and compares the image vector with the text vectors.

```bash
uv run python cli/multimodal_search_cli.py image_search data/paddington.jpeg
```

There is also an LLM-based image-description command. It sends an image and a text prompt to a vision-capable model and asks it to rewrite the text into a better movie search query.

These are two different multimodal strategies:

- CLIP performs direct image-to-text retrieval locally.
- A vision LLM translates visual evidence into a richer text query before normal retrieval.

## Step 11: Evaluate retrieval

A search result that looks reasonable is not enough evidence that the system improved.

The project includes 10 golden test cases. Each case contains a query and a list of movie titles considered relevant.

```json
{
  "query": "a survival story in space",
  "relevant_docs": ["The Martian", "Interstellar"]
}
```

The evaluation CLI calculates:

- **Precision@k:** how many retrieved movies are relevant;
- **Recall@k:** how many expected relevant movies were retrieved; and
- **F1:** the harmonic mean of precision and recall.

```bash
uv run python cli/evaluation_cli.py --limit 5
```

Ten test cases are not enough for a serious benchmark, but they create the right habit: change retrieval, run the same cases, and compare the result.

## The stack and why I chose it

I used:

- **Python** for its ML and data ecosystem.
- **uv** for fast, locked dependency management.
- **NLTK** for Porter stemming.
- **NumPy** for vector storage and cosine similarity.
- **Sentence Transformers** for MiniLM, CLIP, and cross-encoder models.
- **OpenRouter** for hosted LLM calls through an OpenAI-compatible API.
- **Pickle and NumPy files** for local caches.

The local cache is a deliberate learning choice. Adding Qdrant, Elasticsearch, or another service would make deployment more realistic, but it would hide some of the mechanics I wanted to understand. A vector database becomes useful when the collection, update rate, filtering needs, or concurrency outgrow an in-process scan.

## Setup

The complete setup and command reference are in [README.md](README.md). The short version is:

```bash
uv sync
uv run python cli/keyword_search_cli.py build
uv run python cli/semantic_search_cli.py embed_chunks
uv run python cli/hybrid_search_cli.py rrf-search "space survival"
```

LLM-backed commands also need `OPENROUTER_API_KEY`.

## What I learned

### Retrieval quality limits generation quality

A polished answer cannot recover facts that never entered the context. When the result is wrong, I now inspect the lexical results, semantic results, fusion rank, and final prompt separately.

### Exact and semantic search are complements

Embeddings are not a replacement for lexical search. Exact titles and rare names remain strong signals. Semantic similarity helps when the wording changes.

### Rank fusion is a useful baseline

RRF gave me a simple way to combine two retrievers without pretending their scores meant the same thing. It is a strong baseline before learning a custom ranking model.

### Chunking moves the problem

Smaller chunks improve local matches, but they increase storage, startup work, and duplicate evidence. Chunk size and overlap should be evaluated rather than chosen by intuition alone.

### Caches are part of the system

Indexes and embeddings are derived data. They need a clear relationship with the dataset and model version. If the input changes, stale caches can silently produce wrong results.

### Evaluation should start early

A small golden set is imperfect, but it is much better than judging every change with one favorite query.

## Demo and hosting plan

The next milestone is a public demo, but the first version should stay small.

I would add one Streamlit application with two modes:

- **Search** returns ranked movie cards and works entirely from local retrieval.
- **Ask** adds an OpenRouter-generated answer and shows the retrieved movies as sources.

The interface should expose example prompts, keep advanced retrieval controls collapsed, show why each movie was retrieved, and handle slow model startup clearly.

Before deploying, I would:

1. make model and index initialization cacheable;
2. remove working-directory assumptions from cache paths;
3. add bounded retries and visible errors for OpenRouter;
4. prepare a redistributable demo dataset;
5. decide whether to commit the reduced cache or rebuild it during deployment; and
6. add smoke tests for lexical, semantic, hybrid, and RAG paths.

The simplest first host is Streamlit Community Cloud because it deploys a Python app directly from GitHub and provides app-level secret storage. The current constraints are documented in the official [status and limitations](https://docs.streamlit.io/deploy/streamlit-community-cloud/status) and [secrets management](https://docs.streamlit.io/deploy/streamlit-community-cloud/deploy-your-app/secrets-management) guides.

If container control becomes necessary, a Hugging Face Docker Space is the next option. Its [Docker guide](https://huggingface.co/docs/hub/spaces-sdks-docker) explains the single exposed app port, runtime secrets, and non-persistent disk behavior. I would not add a separate FastAPI service until another client needs an API or the UI and retrieval service need to scale independently.

## What I would improve next

1. **Fix deployment boundaries.** Centralize paths, configuration, model loading, and retry behavior.
2. **Validate grounded output.** Include stable movie IDs in context and verify cited IDs against retrieved results.
3. **Expand evaluations.** Add exact-title, paraphrase, typo, genre, actor, and out-of-domain cases.
4. **Measure each retrieval stage.** Report BM25-only, semantic-only, hybrid, and reranked metrics separately.
5. **Add metadata filters.** Support year, rating, runtime, and genre without forcing embeddings to represent structured constraints.
6. **Version the caches.** Store dataset, model, and chunking fingerprints beside every generated artifact.
7. **Add conversational memory only if the demo needs follow-up questions.** It is not required for the first useful version.

## Final thoughts

The most valuable part of this project was not the final LLM call. It was seeing the full retrieval path and understanding where relevance can be gained or lost.

The system is intentionally local and inspectable. BM25 catches exact language. MiniLM catches meaning. RRF combines their rankings. Optional rerankers spend more work on a small candidate set. The LLM receives only the final retrieved movies and turns them into a readable response.

That is the core RAG loop, built one understandable layer at a time.
