'use client';

import Image from 'next/image';
import Link from 'next/link';

const projects = [
  {
    name: 'RAG Builder',
    href: '/projects/rag-builder',
    outcome: 'Indexed 1,174 PDF chunks into an inspectable 15.99 MB dataset for local retrieval and grounded generation.',
    stack: ['Python', 'PyMuPDF', 'Sentence Transformers', 'PyTorch'],
    live: '',
  },
  {
    name: 'FirstWeek',
    href: '/projects/firstweek',
    outcome: 'Indexed 46 curated sections across 5 private projects with scoped retrieval, verified citations, and 129 recorded frontend tests.',
    stack: ['React', 'Express', 'FastAPI', 'LangGraph'],
    live: 'https://first-week-blue.vercel.app/showcase',
  },
  {
    name: 'AI PR Review Agent',
    href: '/projects/ai-pr-review-agent',
    outcome: 'Reviewed a 76-chunk repository with 4 specialist agents for $0.002247 and routed critical findings to human approval.',
    stack: ['Python', 'FastAPI', 'LangGraph', 'PostgreSQL'],
    live: '',
  },
  {
    name: 'Movie Enquirer',
    href: '/projects/movie-enquirer',
    outcome: 'Searches 5,000 movies across 72,909 semantic chunks using BM25, MiniLM, and reciprocal rank fusion.',
    stack: ['Python', 'BM25', 'MiniLM', 'Streamlit'],
    live: 'https://movie-enquirer-byanand.streamlit.app/',
  },
  {
    name: 'MoneyPlant',
    href: '/projects/moneyplant',
    outcome: 'Turns Telegram messages into reversible transactions through a five-minute correction window.',
    stack: ['TypeScript', 'Next.js', 'PostgreSQL', 'grammY'],
    live: '',
  },
  {
    name: 'Personal Site',
    href: '/projects/personal-site',
    outcome: 'Improved measured request throughput by 16.2% while reducing post-load memory by 11%.',
    stack: ['Next.js', 'TypeScript', 'MongoDB', 'Vercel'],
    live: '',
  },
];

const experience = [
  {
    role: 'AI Engineer',
    company: 'Talendy · Tech Japan',
    period: 'Jun 2026 — Present',
    bullets: [
      'Building a production conversational service over LINE with LangGraph, FastAPI, and PostgreSQL-backed state.',
      'Implementing RAG, multi-provider model routing, deterministic safety paths, PII redaction, Redis, Celery, and Docker.',
    ],
  },
  {
    role: 'AI Engineer',
    company: 'Akatsuki AI Technologies',
    period: 'Jan — May 2026',
    bullets: [
      'Shipped a streaming Next.js client used by about 8,200 users across 23,500 sessions.',
      'Built provider-agnostic AI APIs, hybrid retrieval, authentication, analytics, integration tests, and CI security checks.',
    ],
  },
  {
    role: 'Full-Stack Engineer Intern',
    company: 'AI Talent Force · acquired by Akatsuki',
    period: 'Oct — Dec 2025',
    bullets: [
      'Built a responsive React and WebRTC client for a real-time AI interview product.',
      'Implemented a GPU-backed service that converts streamed PCM audio into timestamp-aligned 30 FPS lip-synced video.',
    ],
  },
  {
    role: 'Application Engineering Intern',
    company: 'Accenture',
    period: 'May — Jul 2025',
    bullets: [
      'Delivered an Android client and Python computer-vision service for industrial gauge readings.',
      'Processed 500+ documents daily at 91.6% extraction accuracy, reducing manual effort by 60–70%.',
    ],
  },
];

const skills: Array<[string, string[]]> = [
  ['Languages', ['Python', 'TypeScript', 'JavaScript', 'SQL']],
  ['ML & AI', ['RAG', 'LangGraph', 'Embeddings', 'Hybrid retrieval']],
  ['Backend & Infra', ['FastAPI', 'Node.js', 'PostgreSQL', 'Redis', 'Docker', 'GCP']],
  ['Tools', ['Git', 'Linux', 'CI/CD', 'WebRTC']],
];

const achievements = [
  {
    title: 'Wearable Non-Invasive Asthma Diagnostic System',
    type: 'Co-inventor · Patent publication',
    detail: 'Filed by PDPM Indian Institute of Information Technology, Design and Manufacturing, Jabalpur on 22 July 2025; published in The Patent Office Journal (India), No. 35/2025, on 29 August 2025. Application No. 202521069749 A.',
    href: '/documents/wearable-asthma-diagnostic-patent.pdf',
    linkLabel: 'View patent publication',
  },
  {
    title: 'ThermaOracle',
    type: 'IIT Roorkee ML Competition · Winner',
    detail: 'Won among 120 teams with a machine-learning model achieving 3.9 RMSE, outperforming the second-best solution by 10%.',
    href: undefined,
    linkLabel: undefined,
  },
];

export default function Home() {
  return (
    <div className="portfolio-home home-resume">
      <section className="home-intro" aria-labelledby="hero-title">
        <div>
          <p className="home-role">AI Engineer</p>
          <h1 id="hero-title">Anand Jaiswal.</h1>
          <p className="home-positioning">Building backend systems and applied ML/RAG pipelines.</p>
          <a className="primary-action" href="#projects">View my work</a>
        </div>
        <aside className="home-profile-rail">
          <div className="home-portrait">
            <Image
              src="/images/self2_local.jpg"
              alt="Anand Jaiswal"
              fill
              priority
              sizes="(max-width: 900px) 100vw, 28vw"
            />
          </div>
          <nav className="home-links" aria-label="Professional links">
            <a href="https://github.com/Dev-an01" target="_blank" rel="noreferrer">GitHub <span aria-hidden="true">↗</span></a>
            <a href="https://www.linkedin.com/in/abstractanand/" target="_blank" rel="noreferrer">LinkedIn <span aria-hidden="true">↗</span></a>
            <a href="https://leetcode.com/u/_Sterben/" target="_blank" rel="noreferrer">LeetCode <span aria-hidden="true">↗</span></a>
            <a href="https://codeforces.com/profile/-Sterben-" target="_blank" rel="noreferrer">Codeforces <span aria-hidden="true">↗</span></a>
            <a href="mailto:j.anand.dev@gmail.com">j.anand.dev@gmail.com</a>
          </nav>
        </aside>
      </section>

      <section id="projects" className="home-section home-projects" aria-labelledby="projects-title">
        <header className="home-section-heading">
          <h2 id="projects-title">Projects</h2>
          <p>Selected systems with measurable constraints and inspectable implementation details.</p>
        </header>
        <div className="home-project-grid">
          {projects.map(project => (
            <article key={project.name} className="home-project-card">
              <h3>{project.name}</h3>
              <p>{project.outcome}</p>
              <ul aria-label={`${project.name} technology stack`}>
                {project.stack.map(technology => <li key={technology}>{technology}</li>)}
              </ul>
              <div className="home-project-actions">
                <Link href={project.href}>View details</Link>
                {project.live && (
                  <a href={project.live} target="_blank" rel="noreferrer">Live demo</a>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="home-section home-experience" aria-labelledby="experience-title">
        <header className="home-section-heading">
          <h2 id="experience-title">Experience</h2>
          <p>Reverse-chronological roles, with the work and scope stated directly.</p>
        </header>
        <div className="home-experience-list">
          {experience.map(item => (
            <article key={item.company}>
              <p className="home-experience-period">{item.period}</p>
              <div>
                <h3>{item.role}</h3>
                <p className="home-experience-company">{item.company}</p>
                <ul>{item.bullets.map(bullet => <li key={bullet}>{bullet}</li>)}</ul>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="home-section home-skills" aria-labelledby="skills-title">
        <header className="home-section-heading">
          <h2 id="skills-title">Skills</h2>
          <p>A five-second map of the tools behind the work above.</p>
        </header>
        <dl>
          {skills.map(([group, items]) => (
            <div key={group}>
              <dt>{group}</dt>
              <dd>{items.join(' · ')}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="home-section home-achievements" aria-labelledby="achievements-title">
        <header className="home-section-heading">
          <h2 id="achievements-title">Achievements</h2>
          <p>Selected recognition for applied engineering and machine learning.</p>
        </header>
        <div className="home-achievement-list">
          {achievements.map(achievement => (
            <article key={achievement.title}>
              <p>{achievement.type}</p>
              <h3>{achievement.title}</h3>
              <p className="home-achievement-detail">{achievement.detail}</p>
              {achievement.href && (
                <a href={achievement.href} target="_blank" rel="noreferrer">
                  {achievement.linkLabel} <span aria-hidden="true">↗</span>
                </a>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="home-contact" aria-labelledby="contact-title">
        <div>
          <h2 id="contact-title">Let’s talk.</h2>
          <p>For AI engineering roles, backend systems, or technical collaboration.</p>
        </div>
        <div className="home-contact-links">
          <a href="mailto:j.anand.dev@gmail.com">j.anand.dev@gmail.com</a>
          <a href="https://www.linkedin.com/in/abstractanand/" target="_blank" rel="noreferrer">LinkedIn <span aria-hidden="true">↗</span></a>
        </div>
      </section>
    </div>
  );
}
