'use client';

import { useTheme } from '@/components/ThemeProvider';

export default function AboutPage() {
  const { theme } = useTheme();
  return (
    <article className={`about-page${theme === 'studio' ? ' studio-detail studio-about' : ''}`}>
      <h1>About Anand</h1>
      <p>I&apos;m an AI engineer, full-stack developer, and computer science graduate from IIIT Jabalpur. I enjoy carrying products from interface and API design through data, model orchestration, testing, and deployment.</p>
      <p>My recent work spans streaming Next.js clients, stateful conversational agents, hybrid retrieval, realtime WebRTC experiences, and production services where latency, safety, and failure handling matter.</p>

      <h2>What I&apos;m working toward</h2>
      <ul>
        <li>Full-stack product engineering with React, Next.js, and backend APIs</li>
        <li>Competitive programming and algorithmic problem solving</li>
        <li>Applied artificial intelligence and machine learning</li>
        <li>Realtime systems, developer tooling, and reliable deployment</li>
      </ul>

      <h2>What I&apos;m building now</h2>
      <p>AI PR Review Agent coordinates grounded specialist reviewers with confidence-based human approval. MoneyPlant combines a Telegram bot, shared financial logic, and a private analytics dashboard. RAG Builder exposes retrieval from first principles, while my AI Avatar work joins a responsive React/WebRTC client to a GPU inference pipeline.</p>

      <h2>Why I write</h2>
      <p>Private Learning Logs help me capture ideas while they are fresh. Public posts turn selected notes into clearer explanations that other technical readers can inspect, challenge, and reuse.</p>

      <h2>Beyond the screen</h2>
      <p>I&apos;m interested in solo travel, open-source work, personal projects, and communities that take craft and collaboration seriously.</p>
    </article>
  );
}
