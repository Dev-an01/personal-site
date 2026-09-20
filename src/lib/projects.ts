import fs from 'fs';
import path from 'path';
import { MOVIE_ENQUIRER, PROJECT_CASE_STUDIES } from './projectCaseStudies';

export interface Project {
  slug: string;
  name: string;
  category?: string;
  description: string;
  longDescription: string;
  techStack: string[];
  image: string;
  github: string;
  live: string;
  featured: boolean;
}

const PROJECTS_FILE = path.join(process.cwd(), 'content/projects.json');

export function getAllProjects(): Project[] {
  const data = fs.readFileSync(PROJECTS_FILE, 'utf-8');
  const projects: Project[] = JSON.parse(data);
  const enriched = projects.map(project => {
    const caseStudy = PROJECT_CASE_STUDIES[project.slug];
    if (!caseStudy) return project;

    const { appendix, body, ...overrides } = caseStudy;
    return {
      ...project,
      ...overrides,
      longDescription: `${(body || project.longDescription).trim()}\n\n${appendix.trim()}`,
    };
  });

  return enriched.some(project => project.slug === MOVIE_ENQUIRER.slug)
    ? enriched
    : [...enriched, MOVIE_ENQUIRER];
}

export function getProjectBySlug(slug: string): Project | undefined {
  return getAllProjects().find(p => p.slug === slug);
}

export function saveProjects(projects: Project[]): void {
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2));
}
