/**
 * A compact skills dictionary. It is used to find skills in CVs and job ads,
 * explain matches ("4 of 6 skills"), and stop the drafter from claiming a
 * skill that is not in the user's fact bank.
 */
const SKILLS: Record<string, string[]> = {
  // Languages
  Python: [],
  JavaScript: ["JS"],
  TypeScript: ["TS"],
  Java: [],
  Kotlin: [],
  Swift: [],
  "Objective-C": [],
  Golang: ["Go lang", "Go (Golang)"],
  Rust: [],
  "C++": ["CPP"],
  "C#": ["C sharp"],
  Ruby: [],
  PHP: [],
  Scala: [],
  Elixir: [],
  Haskell: [],
  "R language": ["RStudio", "tidyverse"],
  MATLAB: [],
  SQL: [],
  Bash: ["shell scripting"],
  Solidity: [],
  // Frontend
  React: ["React.js", "ReactJS"],
  "Next.js": ["NextJS"],
  "Vue.js": ["Vue", "VueJS"],
  Angular: [],
  Svelte: [],
  "HTML": ["HTML5"],
  CSS: ["CSS3", "Sass", "SCSS"],
  "Tailwind CSS": ["Tailwind"],
  Redux: [],
  GraphQL: [],
  "React Native": [],
  Flutter: [],
  // Backend & platforms
  "Node.js": ["NodeJS", "Node"],
  Express: ["Express.js"],
  Django: [],
  Flask: [],
  FastAPI: [],
  Spring: ["Spring Boot"],
  Rails: ["Ruby on Rails"],
  ".NET": ["dotnet", "ASP.NET"],
  gRPC: [],
  "REST APIs": ["REST", "RESTful"],
  Microservices: ["microservice"],
  Kafka: ["Apache Kafka"],
  RabbitMQ: [],
  Redis: [],
  PostgreSQL: ["Postgres"],
  MySQL: [],
  MongoDB: [],
  DynamoDB: [],
  Elasticsearch: [],
  Cassandra: [],
  Snowflake: [],
  BigQuery: [],
  Redshift: [],
  Databricks: [],
  // Cloud & infra
  AWS: ["Amazon Web Services"],
  GCP: ["Google Cloud"],
  Azure: ["Microsoft Azure"],
  Docker: [],
  Kubernetes: ["K8s"],
  Terraform: [],
  Ansible: [],
  "CI/CD": ["continuous integration", "continuous delivery"],
  "GitHub Actions": [],
  Jenkins: [],
  Linux: [],
  Git: [],
  Observability: ["Datadog", "Prometheus", "Grafana"],
  // Data & ML
  Pandas: [],
  NumPy: [],
  "scikit-learn": ["sklearn"],
  PyTorch: [],
  TensorFlow: [],
  Spark: ["PySpark", "Apache Spark"],
  Airflow: ["Apache Airflow"],
  dbt: [],
  ETL: ["ELT", "data pipelines", "data pipeline"],
  "Machine learning": ["ML"],
  "Deep learning": [],
  NLP: ["natural language processing"],
  "Computer vision": [],
  LLMs: ["LLM", "large language models", "generative AI", "GenAI"],
  Statistics: ["statistical"],
  "A/B testing": ["experimentation", "AB testing"],
  Tableau: [],
  "Power BI": ["PowerBI"],
  Looker: [],
  Excel: ["Microsoft Excel", "spreadsheets"],
  "Data visualisation": ["data visualization"],
  "Data modelling": ["data modeling"],
  // Security
  Cybersecurity: ["information security", "InfoSec"],
  "Penetration testing": ["pen testing"],
  SIEM: [],
  IAM: ["identity and access management"],
  // Design & product
  Figma: [],
  Sketch: [],
  "UX research": ["user research"],
  "UI design": [],
  Prototyping: [],
  "Design systems": ["design system"],
  Accessibility: ["WCAG", "a11y"],
  "Product management": ["product manager"],
  Roadmapping: ["roadmap"],
  Agile: ["Scrum", "Kanban"],
  Jira: [],
  // Business
  "Stakeholder management": ["stakeholders"],
  "Project management": [],
  "Financial modelling": ["financial modeling"],
  Accounting: [],
  "Customer success": [],
  Sales: ["business development"],
  Salesforce: [],
  HubSpot: [],
  SEO: [],
  "Content marketing": [],
  "Growth marketing": ["performance marketing"],
  Copywriting: [],
  Recruiting: ["recruitment", "talent acquisition"],
  "People management": ["line management", "managed a team", "team lead"],
  Mentoring: ["mentored", "mentorship"],
  "Public speaking": [],
  Testing: ["unit testing", "test automation", "Jest", "Cypress", "Playwright"],
};

type Matcher = { name: string; re: RegExp };

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const MATCHERS: Matcher[] = Object.entries(SKILLS).map(([name, aliases]) => {
  const terms = [name, ...aliases].map(escape).join("|");
  // Custom word boundaries so "C++", "Node.js" and ".NET" match correctly
  // and "Java" does not match inside "JavaScript".
  return {
    name,
    re: new RegExp(`(?<![A-Za-z0-9+#.])(?:${terms})(?![A-Za-z0-9+#])`, "i"),
  };
});

// Short all-caps abbreviations must match case-sensitively to avoid noise
// ("ts" in a sentence, "ml" for millilitres...).
const CASE_SENSITIVE = new Set(["TS", "JS", "ML", "R", "Node"]);

/** Skills mentioned in a text, by canonical name. */
export function extractSkills(text: string): string[] {
  if (!text) return [];
  const found: string[] = [];
  for (const { name, re } of MATCHERS) {
    if (!re.test(text)) continue;
    // Re-check aliases that need exact case.
    const aliases = SKILLS[name];
    const caseOnly = aliases.filter((a) => CASE_SENSITIVE.has(a));
    if (caseOnly.length) {
      const strictTerms = [name, ...aliases.filter((a) => !CASE_SENSITIVE.has(a))]
        .map(escape)
        .join("|");
      const loose = new RegExp(
        `(?<![A-Za-z0-9+#.])(?:${strictTerms})(?![A-Za-z0-9+#])`,
        "i",
      );
      const strict = new RegExp(
        `(?<![A-Za-z0-9+#.])(?:${caseOnly.map(escape).join("|")})(?![A-Za-z0-9+#])`,
      );
      if (!loose.test(text) && !strict.test(text)) continue;
    }
    found.push(name);
  }
  return found;
}

export function normalise(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP = new Set([
  "and", "or", "the", "a", "an", "of", "for", "to", "in", "at", "with", "on",
  "i", "ii", "iii", "remote", "uk", "us", "eu", "london",
]);

export function tokens(s: string): string[] {
  return normalise(s)
    .split(" ")
    .filter((t) => t && !STOP.has(t));
}

const TITLE_SYNONYMS: Record<string, string> = {
  developer: "engineer",
  dev: "engineer",
  swe: "engineer",
  programmer: "engineer",
  sr: "senior",
  jr: "junior",
  mgr: "manager",
  analytics: "analyst",
  scientist: "scientist",
  frontend: "front end",
  backend: "back end",
  fullstack: "full stack",
};

export function titleTokens(s: string) {
  return tokens(
    normalise(s)
      .replace(/front-?end/g, "frontend")
      .replace(/back-?end/g, "backend")
      .replace(/full-?stack/g, "fullstack"),
  ).map((t) => TITLE_SYNONYMS[t] ?? t);
}

/** Number-like tokens ("18%", "2023", "1.5m", "£40k") for fact checking. */
export function numberTokens(s: string): string[] {
  const out = s.match(/\d+(?:[.,]\d+)*\s?(?:%|k|m|bn|x)?/gi) ?? [];
  return out.map((n) => n.replace(/\s/g, "").replace(/,/g, "").toLowerCase());
}

const SENIORITY: [RegExp, string][] = [
  [/\b(intern|internship|placement)\b/i, "intern"],
  [/\b(graduate|grad|entry[- ]level|apprentice)\b/i, "graduate"],
  [/\b(junior|jr\.?|associate)\b/i, "junior"],
  [/\b(senior|sr\.?)\b/i, "senior"],
  [/\b(staff|principal|distinguished)\b/i, "staff"],
  [/\b(lead|manager|head|director|vp|vice president|chief)\b/i, "lead"],
];

/** Seniority implied by a job title; "mid" when nothing is stated. */
export function seniorityOf(title: string): string {
  for (const [re, level] of SENIORITY) if (re.test(title)) return level;
  return "mid";
}

export const SENIORITY_LEVELS = [
  "intern",
  "graduate",
  "junior",
  "mid",
  "senior",
  "staff",
  "lead",
] as const;
