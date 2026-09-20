'use client';

import { useState, useEffect } from 'react';
import { useAuth } from './AuthProvider';
import { useTheme } from './ThemeProvider';
import ProjectCard from './ProjectCard';
import ProjectEditor from './ProjectEditor';

interface ProjectData {
  slug: string;
  name: string;
  description: string;
  longDescription: string;
  techStack: string[];
  image: string;
  github: string;
  live: string;
  featured: boolean;
  category?: string;
}

export default function ProjectListClient() {
  const { isDevMode } = useAuth();
  const { theme } = useTheme();
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);

  const fetchProjects = async () => {
    setLoading(true);
    const res = await fetch('/api/projects');
    const data = await res.json();
    setProjects(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCreate = async (data: Record<string, unknown>) => {
    await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    setShowEditor(false);
    fetchProjects();
  };

  if (showEditor && isDevMode) {
    return (
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>Add Project</h1>
        <ProjectEditor onSave={handleCreate} onCancel={() => setShowEditor(false)} />
      </div>
    );
  }

  const isSystem = theme === 'system';
  const isStudio = theme === 'studio';

  return (
    <div className={isStudio ? 'studio-index studio-projects' : undefined}>
      {/* Header */}
      {isStudio ? (
        <header className="studio-index-header">
          <h1>Projects, without the sales pitch.</h1>
          <p>What I built, which constraints shaped it, and the result you can inspect.</p>
          {isDevMode && <button onClick={() => setShowEditor(true)} className="btn-primary">+ ADD PROJECT</button>}
        </header>
      ) : isSystem ? (
        <header style={{ marginBottom: '2rem', borderBottom: '2px solid #000', paddingBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '-0.025em', marginBottom: '0.5rem' }}>
            System Gallery
          </h1>
          <p style={{ maxWidth: '48rem', fontSize: '0.875rem', lineHeight: 1.6, fontWeight: 500 }}>
            Compilation of technical architectures across{' '}
            <span style={{ backgroundColor: '#00ff41', padding: '0 4px' }}>AI_RESEARCH</span>,{' '}
            <span style={{ backgroundColor: '#ff6b00', padding: '0 4px' }}>FIRMWARE_LOGIC</span>, and low-level kernel experiments.
            <br />++ All modules verified for high-performance deployment.
          </p>
          {isDevMode && (
            <button onClick={() => setShowEditor(true)} className="btn-primary" style={{ marginTop: '1rem' }}>
              + ADD_MODULE
            </button>
          )}
        </header>
      ) : (
        <header style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '0.5rem', fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', letterSpacing: '-0.025em' }}>
            Technical Projects
          </h1>
          <p style={{ maxWidth: '40rem', fontSize: '0.875rem', lineHeight: 1.6, opacity: 0.8, fontFamily: "'JetBrains Mono', monospace" }}>
            A curated selection of my work in{' '}
            <span style={{ color: '#00f2ff', fontWeight: 600 }}>Artificial Intelligence</span>{' '}
            and low-level systems engineering.
          </p>
          {isDevMode && (
            <button onClick={() => setShowEditor(true)} className="btn-primary" style={{ marginTop: '1rem' }}>
              + Add Project
            </button>
          )}
        </header>
      )}

      {loading ? (
        <p>{isStudio ? 'Loading projects…' : isSystem ? 'LOADING_MODULES...' : 'Loading projects...'}</p>
      ) : projects.length === 0 ? (
        <p>{isStudio ? 'No published projects yet.' : isSystem ? 'NO_MODULES_FOUND.' : 'No projects yet.'}</p>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: isSystem ? '2rem' : '1.5rem',
        }}>
          {projects.map((project, index) => (
            <ProjectCard
              key={project.slug}
              slug={project.slug}
              name={project.name}
              description={project.description}
              techStack={project.techStack}
              image={project.image}
              featured={project.featured}
              category={project.category}
              github={project.github}
              live={project.live}
              index={index}
            />
          ))}
        </div>
      )}

      {/* System footer */}
      {isSystem && !loading && projects.length > 0 && (
        <div style={{ marginTop: '3rem', borderTop: '1px solid #000', paddingTop: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold' }}>--- END OF STREAM ---</div>
        </div>
      )}
    </div>
  );
}
