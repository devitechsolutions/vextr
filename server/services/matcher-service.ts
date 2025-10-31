import * as natural from 'natural';
import Fuse from 'fuse.js';

// Simple string similarity function to replace string-similarity library
function compareTwoStrings(first: string, second: string): number {
  if (first === second) return 1;
  if (first.length < 2 || second.length < 2) return 0;

  const firstBigrams = new Map();
  for (let i = 0; i < first.length - 1; i++) {
    const bigram = first.substr(i, 2);
    const count = firstBigrams.has(bigram) ? firstBigrams.get(bigram) + 1 : 1;
    firstBigrams.set(bigram, count);
  }

  let intersectionSize = 0;
  for (let i = 0; i < second.length - 1; i++) {
    const bigram = second.substr(i, 2);
    const count = firstBigrams.has(bigram) ? firstBigrams.get(bigram) : 0;
    if (count > 0) {
      firstBigrams.set(bigram, count - 1);
      intersectionSize++;
    }
  }

  return (2.0 * intersectionSize) / (first.length + second.length - 2);
}

export interface MatchingCriteria {
  skillsScore: number;
  locationScore: number;
  experienceScore: number;
  titleScore: number;
  educationScore: number;
  industryScore: number;
}

export interface SkillMatch {
  skill: string;
  relevance: 'strong' | 'partial' | 'weak';
  similarity: number;
  source: 'direct' | 'synonym' | 'fuzzy' | 'context' | 'candidate';
  sourceContext?: string; // The actual text snippet where the match was found
  sourceLocation?: string; // Where in the profile it was found (e.g., "Job Title", "Profile Summary")
}

export interface MatchResult {
  totalScore: number;
  criteria: MatchingCriteria;
  matchedSkills: string[];
  skillMatches: SkillMatch[];
  candidateSkills: SkillMatch[];
  matchLabel: 'Strong Match' | 'Moderate Match' | 'Weak Match';
  matchIcon: '✅' | '⚠️' | '❌';
  explanation: string;
}

export interface Vacancy {
  id: number;
  title: string;
  skills: string[];
  location: string;
  experienceLevel: string;
  educationLevel: string;
  organization: string;
  department?: string;
  // Customizable matching weights
  skillsWeight?: number;
  locationWeight?: number;
  experienceWeight?: number;
  titleWeight?: number;
  educationWeight?: number;
  industryWeight?: number;
}

export interface Candidate {
  firstName: string;
  lastName: string;
  jobTitle?: string;
  titleDescription?: string;
  profileSummary?: string;
  company?: string;
  companyLocation?: string;
  branche?: string;
  location?: string;
  skills: string[];
  experience?: number;
  education?: string;
  durationCurrentRole?: string;
  durationAtCompany?: string;
  pastEmployer?: string;
  pastRoleTitle?: string;
  pastExperienceDuration?: string;
}

export interface MatchingWeights {
  skills: number;      // Technical Skills Match weight (0-1)
  location: number;    // Location Match weight (0-1)
  experience: number;  // Experience Level Match weight (0-1)
  title: number;       // Title/Role Match weight (0-1)
  education: number;   // Education Level Match weight (0-1)
  industry: number;    // Language/Industry Match weight (0-1)
}

export class VacancyMatcher {
  // Significantly expanded technical skills database (300% increase)
  private static technicalSkills: Set<string> = new Set([
    // Programming Languages & Frameworks
    'javascript', 'typescript', 'python', 'java', 'c#', 'c++', 'c', 'php', 'ruby', 'go', 'rust', 'kotlin', 'swift',
    'react', 'angular', 'vue.js', 'node.js', 'express', 'django', 'flask', 'spring', 'laravel', 'rails', '.net',
    'next.js', 'nuxt.js', 'svelte', 'ember.js', 'backbone.js', 'jquery', 'bootstrap', 'tailwind',
    
    // Databases & Data
    'mysql', 'postgresql', 'mongodb', 'redis', 'elasticsearch', 'oracle', 'sql server', 'sqlite', 'cassandra',
    'dynamodb', 'firebase', 'neo4j', 'influxdb', 'couchdb', 'mariadb', 'db2', 'teradata', 'snowflake',
    'sql', 'nosql', 'database design', 'data modeling', 'etl', 'data warehousing', 'big data', 'analytics',
    
    // Cloud & DevOps
    'aws', 'azure', 'google cloud', 'gcp', 'docker', 'kubernetes', 'jenkins', 'gitlab', 'github actions',
    'terraform', 'ansible', 'chef', 'puppet', 'vagrant', 'prometheus', 'grafana', 'elk stack', 'splunk',
    'microservices', 'serverless', 'lambda', 'api gateway', 'load balancing', 'cdn', 'ci/cd', 'devops',
    
    // HVAC & Climate
    'hvac', 'heating', 'ventilation', 'air conditioning', 'climate control', 'cooling', 'chiller', 'boiler', 'heat pump',
    'refrigeration', 'air quality', 'thermal management', 'psychrometrics', 'energy recovery', 'vrf', 'vav',
    
    // Electrical & Power
    'electrical', 'power', 'ups', 'uninterruptible power supply', 'generator', 'transformer', 'switchgear', 'voltage', 'current',
    'electrical engineering', 'power distribution', 'electrical systems', 'power management', 'battery systems',
    'solar power', 'renewable energy', 'grid systems', 'power electronics', 'motor control', 'plc programming',
    
    // Security & Safety
    'cctv', 'fire safety', 'security systems', 'access control', 'alarm systems', 'surveillance', 'fire suppression',
    'sprinkler systems', 'emergency systems', 'safety protocols', 'security cameras', 'biometric systems',
    'cybersecurity', 'network security', 'information security', 'penetration testing', 'vulnerability assessment',
    
    // Infrastructure & Facilities
    'cabling', 'fiber optic', 'network cabling', 'structured cabling', 'datacenter', 'data center', 'server room',
    'facility management', 'building automation', 'bms', 'building management system', 'smart building',
    'colocations', 'edge computing', 'hyperscale', 'modular construction', 'raised floor', 'cooling systems',
    
    // Mechanical & Engineering
    'mechanical', 'engineering', 'maintenance', 'troubleshooting', 'repair', 'installation', 'commissioning',
    'preventive maintenance', 'predictive maintenance', 'equipment maintenance', 'technical support',
    'cad', 'autocad', 'solidworks', 'inventor', 'fusion 360', 'revit', 'sketchup', '3d modeling',
    
    // Technology & Software
    'automation', 'plc', 'scada', 'monitoring systems', 'control systems', 'sensors', 'iot', 'building controls',
    'energy management', 'bms programming', 'system integration', 'network infrastructure',
    'machine learning', 'artificial intelligence', 'ai', 'ml', 'deep learning', 'neural networks',
    
    // Web Technologies
    'html', 'css', 'sass', 'less', 'webpack', 'vite', 'parcel', 'rollup', 'babel', 'eslint', 'prettier',
    'responsive design', 'mobile development', 'pwa', 'spa', 'seo', 'accessibility', 'web performance',
    
    // Mobile Development
    'ios', 'android', 'react native', 'flutter', 'xamarin', 'ionic', 'cordova', 'phonegap', 'swift', 'objective-c',
    'kotlin', 'java', 'dart', 'mobile ui', 'app store', 'google play', 'mobile testing',
    
    // Testing & Quality
    'testing', 'unit testing', 'integration testing', 'e2e testing', 'selenium', 'cypress', 'jest', 'mocha',
    'junit', 'pytest', 'test automation', 'tdd', 'bdd', 'quality assurance', 'performance testing',
    
    // Compliance & Standards
    'compliance', 'regulations', 'standards', 'codes', 'safety standards', 'building codes', 'electrical codes',
    'fire codes', 'energy efficiency', 'sustainability', 'green building', 'leed', 'breeam', 'iso 27001',
    'gdpr', 'hipaa', 'sox', 'pci dss', 'iso 9001', 'itil', 'cobit', 'nist',
    
    // Specific Technologies & Vendors
    'schneider electric', 'siemens', 'honeywell', 'johnson controls', 'trane', 'carrier', 'daikin',
    'abb', 'eaton', 'legrand', 'cisco', 'dell', 'hp', 'ibm', 'vmware', 'microsoft', 'oracle',
    'salesforce', 'sap', 'workday', 'servicenow', 'atlassian', 'jira', 'confluence', 'slack', 'teams',
    
    // Emerging Technologies
    'blockchain', 'cryptocurrency', 'web3', 'metaverse', 'ar', 'vr', 'augmented reality', 'virtual reality',
    'quantum computing', 'edge ai', '5g', 'iot edge', 'digital twin', 'robotics', 'rpa', 'chatbots',
    
    // Data Science & Analytics
    'data science', 'machine learning', 'statistics', 'r', 'pandas', 'numpy', 'scikit-learn', 'tensorflow',
    'pytorch', 'keras', 'tableau', 'power bi', 'qlikview', 'looker', 'spark', 'hadoop', 'kafka'
  ]);

  // Soft skills to ignore during matching
  private static softSkills: Set<string> = new Set([
    'communication', 'teamwork', 'leadership', 'problem-solving', 'critical thinking', 'analytical',
    'time management', 'organization', 'attention to detail', 'customer service', 'interpersonal',
    'adaptability', 'flexibility', 'creativity', 'innovation', 'collaboration', 'negotiation',
    'presentation', 'public speaking', 'conflict resolution', 'decision making', 'stress management',
    'multitasking', 'project management', 'team player', 'self-motivated', 'proactive', 'reliable'
  ]);

  // Non-skill words to filter out during skill extraction
  private static nonSkillWords: Set<string> = new Set([
    'less', 'more', 'and', 'or', 'the', 'of', 'to', 'in', 'for', 'with', 'at', 'by', 'from', 'as',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'must', 'do', 'does', 'did', 'done', 'get', 'got', 'give', 'gave',
    'take', 'took', 'make', 'made', 'come', 'came', 'go', 'went', 'see', 'saw', 'know', 'knew',
    'think', 'thought', 'say', 'said', 'tell', 'told', 'work', 'worked', 'use', 'used', 'find', 'found',
    'give', 'turn', 'ask', 'feel', 'try', 'leave', 'call', 'move', 'live', 'seem', 'provide', 'allow',
    'keep', 'hold', 'bring', 'happen', 'begin', 'help', 'talk', 'put', 'show', 'follow', 'run', 'write',
    'sit', 'stand', 'lose', 'pay', 'meet', 'include', 'continue', 'set', 'learn', 'change', 'lead',
    'understand', 'watch', 'let', 'without', 'again', 'place', 'old', 'number', 'part', 'world', 'over',
    'new', 'sound', 'only', 'little', 'very', 'back', 'after', 'around', 'just', 'where', 'much',
    'through', 'well', 'large', 'must', 'big', 'even', 'such', 'because', 'turn', 'here', 'why', 'so',
    'up', 'out', 'if', 'about', 'who', 'get', 'which', 'their', 'me', 'than', 'first', 'been', 'its',
    'who', 'now', 'people', 'my', 'made', 'over', 'did', 'down', 'way', 'she', 'may', 'years', 'him',
    'them', 'these', 'long', 'both', 'how', 'her', 'oil', 'sit', 'set', 'hot', 'but', 'what', 'some',
    'had', 'or', 'year', 'work', 'but', 'want', 'school', 'important', 'until', 'form', 'food', 'keep',
    'children', 'feet', 'land', 'side', 'without', 'boy', 'once', 'animal', 'life', 'enough', 'took',
    'sometimes', 'four', 'head', 'above', 'kind', 'began', 'almost', 'live', 'page', 'got', 'earth',
    'need', 'far', 'hand', 'high', 'year', 'mother', 'light', 'country', 'father', 'let', 'night',
    'picture', 'being', 'study', 'second', 'soon', 'story', 'since', 'white', 'ever', 'paper', 'hard',
    'near', 'sentence', 'better', 'best', 'across', 'during', 'today', 'however', 'sure', 'knew',
    'its', 'before', 'move', 'right', 'boy', 'old', 'too', 'same', 'tell', 'does', 'set', 'three',
    'want', 'air', 'well', 'also', 'play', 'small', 'end', 'put', 'home', 'read', 'hand', 'port',
    'large', 'spell', 'add', 'even', 'land', 'here', 'must', 'big', 'high', 'such', 'follow', 'act',
    'why', 'ask', 'men', 'change', 'went', 'light', 'kind', 'off', 'need', 'house', 'picture', 'try',
    'us', 'again', 'animal', 'point', 'mother', 'world', 'near', 'build', 'self', 'earth', 'father',
    'head', 'stand', 'own', 'page', 'should', 'country', 'found', 'answer', 'school', 'grow', 'study',
    'still', 'learn', 'plant', 'cover', 'food', 'sun', 'four', 'between', 'state', 'keep', 'eye',
    'never', 'last', 'let', 'thought', 'city', 'tree', 'cross', 'farm', 'start', 'might', 'story',
    'saw', 'far', 'sea', 'draw', 'left', 'late', 'run', 'dont', 'while', 'press', 'close', 'night',
    'real', 'life', 'few', 'north', 'open', 'seem', 'together', 'next', 'white', 'children', 'begin',
    'got', 'walk', 'example', 'ease', 'paper', 'group', 'always', 'music', 'those', 'both', 'mark',
    'often', 'letter', 'until', 'mile', 'river', 'car', 'feet', 'care', 'second', 'book', 'carry',
    'took', 'science', 'eat', 'room', 'friend', 'began', 'idea', 'fish', 'mountain', 'stop', 'once',
    'base', 'hear', 'horse', 'cut', 'sure', 'watch', 'color', 'face', 'wood', 'main', 'enough',
    'plain', 'girl', 'usual', 'young', 'ready', 'above', 'ever', 'red', 'list', 'though', 'feel',
    'talk', 'bird', 'soon', 'body', 'dog', 'family', 'direct', 'pose', 'leave', 'song', 'measure',
    'door', 'product', 'black', 'short', 'numeral', 'class', 'wind', 'question', 'happen', 'complete',
    'ship', 'area', 'half', 'rock', 'order', 'fire', 'south', 'problem', 'piece', 'told', 'knew',
    'pass', 'since', 'top', 'whole', 'king', 'space', 'heard', 'best', 'hour', 'better', 'during',
    'hundred', 'five', 'remember', 'step', 'early', 'hold', 'west', 'ground', 'interest', 'reach',
    'fast', 'verb', 'sing', 'listen', 'six', 'table', 'travel', 'less', 'morning', 'ten', 'simple',
    'several', 'vowel', 'toward', 'war', 'lay', 'against', 'pattern', 'slow', 'center', 'love',
    'person', 'money', 'serve', 'appear', 'road', 'map', 'rain', 'rule', 'govern', 'pull', 'cold',
    'notice', 'voice', 'unit', 'power', 'town', 'fine', 'certain', 'fly', 'fall', 'lead', 'cry',
    'dark', 'machine', 'note', 'wait', 'plan', 'figure', 'star', 'box', 'noun', 'field', 'rest',
    'correct', 'able', 'pound', 'done', 'beauty', 'drive', 'stood', 'contain', 'front', 'teach',
    'week', 'final', 'gave', 'green', 'oh', 'quick', 'develop', 'ocean', 'warm', 'free', 'minute',
    'strong', 'special', 'mind', 'behind', 'clear', 'tail', 'produce', 'fact', 'street', 'inch',
    'multiply', 'nothing', 'course', 'stay', 'wheel', 'full', 'force', 'blue', 'object', 'decide',
    'surface', 'deep', 'moon', 'island', 'foot', 'system', 'busy', 'test', 'record', 'boat',
    'common', 'gold', 'possible', 'plane', 'stead', 'dry', 'wonder', 'laugh', 'thousands', 'ago',
    'ran', 'check', 'game', 'shape', 'equate', 'hot', 'miss', 'brought', 'heat', 'snow', 'tire',
    'bring', 'yes', 'distant', 'fill', 'east', 'paint', 'language', 'among'
  ]);

  // Significantly expanded skill synonyms database
  private static skillSynonyms: { [key: string]: string[] } = {
    // Programming & Development
    'javascript': ['js', 'ecmascript', 'es6', 'es2015', 'node', 'nodejs'],
    'typescript': ['ts'],
    'python': ['py', 'python3'],
    'java': ['jvm', 'openjdk'],
    'c#': ['csharp', 'dotnet', '.net'],
    'c++': ['cpp', 'cplusplus'],
    'react': ['reactjs', 'react.js'],
    'angular': ['angularjs', 'ng'],
    'vue.js': ['vue', 'vuejs'],
    'node.js': ['nodejs', 'node'],
    
    // Cloud & Infrastructure
    'aws': ['amazon web services', 'amazon cloud'],
    'azure': ['microsoft azure', 'azure cloud'],
    'gcp': ['google cloud platform', 'google cloud'],
    'docker': ['containerization', 'containers'],
    'kubernetes': ['k8s', 'container orchestration'],
    'jenkins': ['ci/cd', 'continuous integration'],
    'terraform': ['infrastructure as code', 'iac'],
    
    // Databases
    'mysql': ['my sql'],
    'postgresql': ['postgres', 'pg'],
    'mongodb': ['mongo', 'document database'],
    'redis': ['in-memory database', 'cache'],
    'elasticsearch': ['elastic search', 'es'],
    
    // Technical Roles
    'engineer': ['technician', 'specialist', 'expert', 'consultant'],
    'developer': ['programmer', 'coder', 'engineer', 'architect', 'dev'],
    'analyst': ['researcher', 'specialist', 'consultant'],
    'manager': ['lead', 'supervisor', 'director', 'head'],
    'support': ['maintenance', 'service', 'assistance', 'help'],
    
    // HVAC & Facilities
    'hvac': ['heating', 'ventilation', 'air conditioning', 'climate control'],
    'facility': ['building', 'infrastructure', 'maintenance', 'operations'],
    'technical': ['tech', 'engineering', 'mechanical', 'electrical'],
    'ups': ['uninterruptible power supply', 'backup power', 'power backup'],
    'bms': ['building management system', 'building automation', 'building controls'],
    'cctv': ['security cameras', 'surveillance', 'video surveillance', 'camera systems'],
    
    // Modern Technologies
    'machine learning': ['ml', 'artificial intelligence', 'ai'],
    'artificial intelligence': ['ai', 'machine learning', 'ml'],
    'devops': ['development operations', 'dev ops'],
    'microservices': ['micro services', 'service architecture'],
    'api': ['application programming interface', 'web api', 'rest api'],
    'frontend': ['front-end', 'client-side', 'ui'],
    'backend': ['back-end', 'server-side', 'api'],
    'fullstack': ['full-stack', 'full stack'],
    
    // Testing & Quality
    'testing': ['qa', 'quality assurance', 'test automation'],
    'automation': ['automated testing', 'test automation'],
    
    // Security
    'cybersecurity': ['cyber security', 'information security', 'infosec'],
    'penetration testing': ['pen testing', 'ethical hacking', 'security testing']
  };

  // Enhanced location regions database
  private static locationRegions: { [key: string]: string[] } = {
    'germany': ['deutschland', 'berlin', 'munich', 'münchen', 'frankfurt', 'hamburg', 'cologne', 'köln', 'dortmund', 'essen', 'düsseldorf', 'stuttgart'],
    'netherlands': ['nederland', 'amsterdam', 'rotterdam', 'the hague', 'den haag', 'utrecht', 'eindhoven', 'tilburg', 'groningen', 'almere'],
    'belgium': ['brussels', 'bruxelles', 'antwerp', 'antwerpen', 'ghent', 'gent', 'bruges', 'brugge', 'leuven', 'namur'],
    'france': ['paris', 'lyon', 'marseille', 'toulouse', 'nice', 'nantes', 'strasbourg', 'montpellier', 'bordeaux', 'lille'],
    'united kingdom': ['london', 'manchester', 'birmingham', 'leeds', 'glasgow', 'sheffield', 'bradford', 'liverpool', 'edinburgh', 'bristol'],
    'sweden': ['stockholm', 'gothenburg', 'göteborg', 'malmö', 'uppsala', 'västerås', 'örebro', 'linköping'],
    'switzerland': ['zurich', 'zürich', 'geneva', 'genève', 'basel', 'bern', 'lausanne', 'winterthur'],
    'italy': ['rome', 'roma', 'milan', 'milano', 'naples', 'napoli', 'turin', 'torino', 'palermo', 'genoa'],
    'spain': ['madrid', 'barcelona', 'valencia', 'seville', 'sevilla', 'zaragoza', 'málaga', 'murcia', 'palma', 'bilbao'],
    'poland': ['warsaw', 'warszawa', 'kraków', 'krakow', 'łódź', 'wrocław', 'poznań', 'gdańsk', 'szczecin', 'bydgoszcz'],
    'austria': ['vienna', 'wien', 'graz', 'linz', 'salzburg', 'innsbruck', 'klagenfurt'],
    'denmark': ['copenhagen', 'københavn', 'aarhus', 'odense', 'aalborg', 'esbjerg'],
    'norway': ['oslo', 'bergen', 'trondheim', 'stavanger', 'drammen', 'fredrikstad'],
    'finland': ['helsinki', 'espoo', 'tampere', 'vantaa', 'turku', 'oulu']
  };

  private static experienceLevels: { [key: string]: { min: number; max: number } } = {
    'junior': { min: 0, max: 2 },
    'mid level': { min: 2, max: 7 },
    'mid-level': { min: 2, max: 7 },
    'senior': { min: 5, max: 15 },
    'lead': { min: 7, max: 20 },
    'manager': { min: 5, max: 25 },
    'director': { min: 10, max: 30 }
  };

  /**
   * Calculate comprehensive match score between candidate and vacancy
   */
  public static calculateMatchScore(candidate: Candidate, vacancy: Vacancy): MatchResult {
    // Use vacancy-specific weights or default weights
    // Use nullish coalescing to handle 0 values properly
    const weights: MatchingWeights = {
      skills: (vacancy.skillsWeight ?? 40) / 100,      // Convert percentage to decimal
      location: (vacancy.locationWeight ?? 25) / 100,
      experience: (vacancy.experienceWeight ?? 15) / 100,
      title: (vacancy.titleWeight ?? 10) / 100,
      education: (vacancy.educationWeight ?? 5) / 100,
      industry: (vacancy.industryWeight ?? 5) / 100
    };

    // Validate weights sum to 1.0 (with small tolerance for rounding)
    const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
    if (Math.abs(totalWeight - 1.0) > 0.01) {
      console.warn(`Vacancy ${vacancy.id} weights don't sum to 100%: ${(totalWeight * 100).toFixed(1)}%`);
    }

    // Calculate individual scores
    const skillsResult = this.calculateEnhancedSkillsMatch(candidate, vacancy);
    const locationScore = this.calculateEnhancedLocationMatch(candidate, vacancy);
    const experienceScore = this.calculateEnhancedExperienceMatch(candidate, vacancy);
    const titleScore = this.calculateTitleMatch(candidate, vacancy);
    const educationScore = this.calculateEducationMatch(candidate, vacancy);
    const industryScore = this.calculateIndustryMatch(candidate, vacancy);

    // Calculate weighted total score
    const totalScore = Math.round(
      skillsResult.score * weights.skills +
      locationScore.score * weights.location +
      experienceScore.score * weights.experience +
      titleScore * weights.title +
      educationScore * weights.education +
      industryScore * weights.industry
    );

    // Create match result
    const criteria: MatchingCriteria = {
      skillsScore: Math.round(skillsResult.score),
      locationScore: Math.round(locationScore.score),
      experienceScore: Math.round(experienceScore.score),
      titleScore: Math.round(titleScore),
      educationScore: Math.round(educationScore),
      industryScore: Math.round(industryScore)
    };

    const matchLabel = totalScore >= 70 ? 'Strong Match' : 
                      totalScore >= 40 ? 'Moderate Match' : 'Weak Match';
    const matchIcon = totalScore >= 70 ? '✅' : 
                     totalScore >= 40 ? '⚠️' : '❌';

    // Generate explanation
    const explanation = this.generateMatchExplanation(criteria, weights, totalScore);

    return {
      totalScore,
      criteria,
      matchedSkills: skillsResult.matchedSkills,
      skillMatches: skillsResult.skillMatches,
      candidateSkills: skillsResult.candidateSkills,
      matchLabel,
      matchIcon,
      explanation
    };
  }

  /**
   * Enhanced skills matching with color-coded relevance
   */
  private static calculateEnhancedSkillsMatch(candidate: Candidate, vacancy: Vacancy): { 
    score: number; 
    matchedSkills: string[];
    skillMatches: SkillMatch[];
    candidateSkills: SkillMatch[];
  } {
    if (!vacancy.skills || vacancy.skills.length === 0) {
      return { score: 0, matchedSkills: [], skillMatches: [], candidateSkills: [] };
    }

    // Use all vacancy skills, not just technical ones (for comprehensive matching)
    const vacancySkillsToMatch = vacancy.skills;

    if (vacancySkillsToMatch.length === 0) {
      console.warn(`Vacancy ${vacancy.id} has no skills to match against`);
      return { score: 0, matchedSkills: [], skillMatches: [], candidateSkills: [] };
    }

    // Extract all candidate skills from various sources
    const candidateSkillsFromFields = this.extractCandidateSkills(candidate);
    const candidateText = this.buildCandidateSkillsText(candidate);
    
    const skillMatches: SkillMatch[] = [];
    const candidateSkills: SkillMatch[] = [];
    const matchedSkills: string[] = [];
    let totalMatches = 0;

    // Analyze each vacancy skill
    for (const vacancySkill of vacancySkillsToMatch) {
      const skillMatch = this.analyzeSkillMatch(vacancySkill, candidateText, candidateSkillsFromFields, candidate);
      if (skillMatch) {
        skillMatches.push(skillMatch);
        if (skillMatch.relevance !== 'weak') {
          matchedSkills.push(vacancySkill);
          totalMatches++;
        }
      }
    }

    // Analyze candidate skills against vacancy requirements
    for (const candidateSkill of candidateSkillsFromFields) {
      if (this.isTechnicalSkill(candidateSkill.toLowerCase())) {
        const relevance = this.calculateCandidateSkillRelevance(candidateSkill, vacancySkillsToMatch);
        candidateSkills.push({
          skill: candidateSkill,
          relevance,
          similarity: this.getBestSimilarity(candidateSkill, vacancySkillsToMatch),
          source: 'context'
        });
      }
    }

    // Progressive Weighting by Performance approach
    const score = this.calculateProgressiveWeightedScore(skillMatches);
    return { score, matchedSkills, skillMatches, candidateSkills };
  }

  /**
   * Calculate skills score using Progressive Weighting by Performance
   * - Best skill match: 40% weight
   * - 2nd best: 30% weight  
   * - 3rd best: 20% weight
   * - 4th best: 10% weight
   */
  private static calculateProgressiveWeightedScore(skillMatches: SkillMatch[]): number {
    if (skillMatches.length === 0) return 0;

    // Progressive weights (must sum to 1.0)
    const weights = [0.4, 0.3, 0.2, 0.1];
    
    // Sort skill matches by similarity score (highest first)
    const sortedMatches = skillMatches
      .slice() // Create copy to avoid mutating original
      .sort((a, b) => b.similarity - a.similarity);

    let weightedScore = 0;
    let totalWeight = 0;

    // Apply progressive weighting to top matches
    for (let i = 0; i < Math.min(sortedMatches.length, weights.length); i++) {
      const match = sortedMatches[i];
      const weight = weights[i];
      
      // Use similarity percentage as the score for this skill
      weightedScore += match.similarity * weight;
      totalWeight += weight;
    }

    // If we have fewer skills than weights, normalize by actual total weight used
    return totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0;
  }

  /**
   * Legacy technical skills matching for backward compatibility
   */
  private static calculateTechnicalSkillsMatch(candidate: Candidate, vacancy: Vacancy): { score: number; matchedSkills: string[] } {
    if (!vacancy.skills || vacancy.skills.length === 0) {
      return { score: 0, matchedSkills: [] };
    }

    // Filter vacancy skills to only include technical skills
    const technicalVacancySkills = vacancy.skills.filter(skill => 
      this.isTechnicalSkill(skill.toLowerCase())
    );

    if (technicalVacancySkills.length === 0) {
      console.warn(`Vacancy ${vacancy.id} has no technical skills to match against`);
      return { score: 0, matchedSkills: [] };
    }

    // Gather all candidate skill sources
    const candidateSkillSources = [
      ...(candidate.skills || []),
      candidate.titleDescription || '',
      candidate.profileSummary || '',
      candidate.jobTitle || '',
      candidate.pastRoleTitle || ''
    ].filter(Boolean);

    const candidateText = candidateSkillSources.join(' ').toLowerCase();
    const matchedSkills: string[] = [];
    let totalMatches = 0;

    for (const skill of technicalVacancySkills) {
      const skillLower = skill.toLowerCase();
      let isMatched = false;

      // Direct keyword match
      if (candidateText.includes(skillLower)) {
        matchedSkills.push(skill);
        isMatched = true;
      } else {
        // Synonym matching
        const synonyms = this.skillSynonyms[skillLower] || [];
        for (const synonym of synonyms) {
          if (candidateText.includes(synonym.toLowerCase())) {
            matchedSkills.push(skill);
            isMatched = true;
            break;
          }
        }

        // Fuzzy matching for partial matches
        if (!isMatched) {
          for (const candidateSkill of candidate.skills || []) {
            const candidateSkillLower = candidateSkill.toLowerCase();
            // Only match against technical skills from candidate
            if (this.isTechnicalSkill(candidateSkillLower)) {
              const similarity = compareTwoStrings(skillLower, candidateSkillLower);
              if (similarity > 0.7) {
                matchedSkills.push(skill);
                isMatched = true;
                break;
              }
            }
          }
        }
      }

      if (isMatched) totalMatches++;
    }

    const score = (totalMatches / technicalVacancySkills.length) * 100;
    return { score, matchedSkills };
  }

  /**
   * Check if a skill is considered technical (not soft skill)
   */
  private static isTechnicalSkill(skill: string): boolean {
    const skillLower = skill.toLowerCase().trim();
    
    // First check if it's explicitly a soft skill
    if (this.softSkills.has(skillLower)) {
      return false;
    }
    
    // Check if it's in our technical skills whitelist
    if (this.technicalSkills.has(skillLower)) {
      return true;
    }
    
    // Check synonyms for technical skills
    for (const [technicalSkill, synonyms] of Object.entries(this.skillSynonyms)) {
      if (this.technicalSkills.has(technicalSkill) && synonyms.includes(skillLower)) {
        return true;
      }
    }
    
    // Check if skill contains technical keywords
    const technicalKeywords = [
      'engineer', 'technical', 'system', 'software', 'hardware', 'network', 'security',
      'maintenance', 'installation', 'configuration', 'monitoring', 'automation',
      'electrical', 'mechanical', 'hvac', 'facility', 'infrastructure', 'equipment'
    ];
    
    return technicalKeywords.some(keyword => skillLower.includes(keyword));
  }

  /**
   * Location matching with proximity scoring (25% weight)
   */
  private static calculateLocationMatch(candidate: Candidate, vacancy: Vacancy): number {
    if (!vacancy.location) return 0;

    const vacancyLocation = vacancy.location.toLowerCase();
    const candidateLocations = [
      candidate.location,
      candidate.companyLocation,
    ].filter(Boolean).map(loc => loc!.toLowerCase());

    if (candidateLocations.length === 0) return 0;

    let bestScore = 0;

    for (const candidateLocation of candidateLocations) {
      // Same city/exact match
      if (candidateLocation.includes(vacancyLocation) || vacancyLocation.includes(candidateLocation)) {
        bestScore = Math.max(bestScore, 100);
        continue;
      }

      // Same region/country matching
      for (const [country, cities] of Object.entries(this.locationRegions)) {
        const vacancyInCountry = cities.some(city => vacancyLocation.includes(city)) || vacancyLocation.includes(country);
        const candidateInCountry = cities.some(city => candidateLocation.includes(city)) || candidateLocation.includes(country);

        if (vacancyInCountry && candidateInCountry) {
          // Same country, different city
          bestScore = Math.max(bestScore, 50);
        }
      }

      // EU proximity check
      const euCountries = ['germany', 'netherlands', 'belgium', 'france', 'sweden', 'switzerland'];
      const vacancyInEU = euCountries.some(country => vacancyLocation.includes(country));
      const candidateInEU = euCountries.some(country => candidateLocation.includes(country));

      if (vacancyInEU && candidateInEU && bestScore < 50) {
        bestScore = 25;
      }
    }

    return bestScore;
  }

  /**
   * Experience level matching (15% weight)
   */
  private static calculateExperienceMatch(candidate: Candidate, vacancy: Vacancy): number {
    if (!vacancy.experienceLevel) return 0;

    const vacancyLevel = vacancy.experienceLevel.toLowerCase();
    const experienceRange = this.experienceLevels[vacancyLevel];

    if (!experienceRange) return 0;

    // Calculate total experience from various sources
    let totalExperience = candidate.experience || 0;

    // Parse duration strings to extract years
    const durationSources = [
      candidate.durationCurrentRole,
      candidate.durationAtCompany,
      candidate.pastExperienceDuration
    ].filter(Boolean);

    for (const duration of durationSources) {
      const years = this.parseDurationToYears(duration!);
      totalExperience = Math.max(totalExperience, years);
    }

    // Check for experience indicators in titles
    const titleSources = [candidate.jobTitle, candidate.pastRoleTitle].filter(Boolean);
    for (const title of titleSources) {
      const titleLower = title!.toLowerCase();
      if (titleLower.includes('senior') || titleLower.includes('lead')) {
        totalExperience = Math.max(totalExperience, 5);
      } else if (titleLower.includes('manager') || titleLower.includes('director')) {
        totalExperience = Math.max(totalExperience, 7);
      } else if (titleLower.includes('junior') && totalExperience < 3) {
        totalExperience = Math.max(totalExperience, 1);
      }
    }

    // Score based on how well experience matches the required range
    if (totalExperience >= experienceRange.min && totalExperience <= experienceRange.max) {
      return 100; // Perfect match
    } else if (totalExperience < experienceRange.min) {
      // Under-experienced
      const gap = experienceRange.min - totalExperience;
      return Math.max(0, 100 - (gap * 20));
    } else {
      // Over-experienced (less penalty)
      const excess = totalExperience - experienceRange.max;
      return Math.max(50, 100 - (excess * 10));
    }
  }

  /**
   * Enhanced title and role matching (10% weight)
   * Now handles word normalization and weighted keyword matching
   */
  private static calculateTitleMatch(candidate: Candidate, vacancy: Vacancy): number {
    if (!vacancy.title) return 0;

    const candidateTitles = [
      candidate.jobTitle,
      candidate.pastRoleTitle
    ].filter(Boolean);

    if (candidateTitles.length === 0) return 0;

    let bestScore = 0;

    for (const candidateTitle of candidateTitles) {
      const score = this.calculateTitleSimilarity(vacancy.title, candidateTitle);
      bestScore = Math.max(bestScore, score);
    }

    return bestScore;
  }

  /**
   * Advanced title similarity calculation with word normalization and keyword weighting
   */
  private static calculateTitleSimilarity(vacancyTitle: string, candidateTitle: string): number {
    const normalizeWord = (word: string): string => {
      word = word.toLowerCase().trim();
      
      // Handle common title variations and synonyms
      const synonyms: { [key: string]: string } = {
        'architect': 'architect',
        'architecture': 'architect',
        'engineering': 'engineer',
        'engineer': 'engineer',
        'development': 'developer',
        'developer': 'developer',
        'manager': 'manager',
        'management': 'manager',
        'director': 'director',
        'lead': 'leader',
        'leader': 'leader',
        'senior': 'senior',
        'principal': 'senior',
        'staff': 'senior',
        'head': 'director',
        'chief': 'director',
        'vp': 'director',
        'specialist': 'specialist',
        'expert': 'specialist'
      };
      
      return synonyms[word] || word;
    };

    // Extract and normalize words
    const vacancyWords = vacancyTitle.toLowerCase().split(/\s+/).map(normalizeWord);
    const candidateWords = candidateTitle.toLowerCase().split(/\s+/).map(normalizeWord);

    // Identify core technical keywords (these get higher weight)
    const technicalKeywords = new Set([
      'gpu', 'cpu', 'architect', 'engineer', 'developer', 'data', 'software', 
      'hardware', 'cloud', 'devops', 'security', 'ai', 'ml', 'blockchain',
      'frontend', 'backend', 'fullstack', 'mobile', 'web', 'ios', 'android',
      'python', 'java', 'javascript', 'react', 'angular', 'node', 'aws',
      'azure', 'gcp', 'kubernetes', 'docker', 'api', 'database', 'sql'
    ]);

    // Calculate weighted keyword matching
    let totalScore = 0;
    let maxPossibleScore = 0;

    for (const vacancyWord of vacancyWords) {
      const isCore = technicalKeywords.has(vacancyWord);
      const weight = isCore ? 3.0 : 1.0; // Core keywords worth 3x more
      maxPossibleScore += weight;

      if (candidateWords.includes(vacancyWord)) {
        totalScore += weight;
      } else {
        // Check for partial matches in core keywords
        if (isCore) {
          for (const candidateWord of candidateWords) {
            const similarity = compareTwoStrings(vacancyWord, candidateWord);
            if (similarity > 0.7) { // 70% similarity threshold for partial match
              totalScore += weight * similarity;
              break;
            }
          }
        }
      }
    }

    // Calculate base score from weighted matching
    const weightedScore = maxPossibleScore > 0 ? (totalScore / maxPossibleScore) * 100 : 0;

    // Apply bonus for exact core keyword matches
    let coreKeywordBonus = 0;
    for (const vacancyWord of vacancyWords) {
      if (technicalKeywords.has(vacancyWord) && candidateWords.includes(vacancyWord)) {
        coreKeywordBonus += 15; // 15% bonus per exact core keyword match
      }
    }

    // Apply bonus for seniority level alignment
    const seniorityWords = ['senior', 'principal', 'staff', 'director', 'lead', 'chief', 'head'];
    const vacancyHasSeniority = vacancyWords.some(w => seniorityWords.includes(w));
    const candidateHasSeniority = candidateWords.some(w => seniorityWords.includes(w));
    const seniorityBonus = vacancyHasSeniority && candidateHasSeniority ? 10 : 0;

    // Combine scores
    const finalScore = Math.min(100, weightedScore + coreKeywordBonus + seniorityBonus);
    
    console.log(`🎯 Title Match: "${vacancyTitle}" vs "${candidateTitle}"`);
    console.log(`   Weighted Score: ${weightedScore.toFixed(1)}%`);
    console.log(`   Core Keyword Bonus: ${coreKeywordBonus}%`);
    console.log(`   Seniority Bonus: ${seniorityBonus}%`);
    console.log(`   Final Score: ${finalScore.toFixed(1)}%`);

    return finalScore;
  }

  /**
   * Education level matching (5% weight)
   */
  private static calculateEducationMatch(candidate: Candidate, vacancy: Vacancy): number {
    if (!vacancy.educationLevel || !candidate.education) {
      return 50; // Neutral score when education data is missing
    }

    const vacancyEducation = vacancy.educationLevel.toLowerCase();
    const candidateEducation = candidate.education.toLowerCase();
    
    // Education level hierarchy (higher numbers = higher education)
    const educationLevels: { [key: string]: number } = {
      'high school': 1,
      'secondary': 1,
      'diploma': 2,
      'associate': 2,
      'bachelor': 3,
      'undergraduate': 3,
      'master': 4,
      'masters': 4,
      'graduate': 4,
      'mba': 4,
      'phd': 5,
      'doctorate': 5,
      'professor': 6
    };
    
    // Find education levels
    let vacancyLevel = 0;
    let candidateLevel = 0;
    
    for (const [education, level] of Object.entries(educationLevels)) {
      if (vacancyEducation.includes(education)) {
        vacancyLevel = Math.max(vacancyLevel, level);
      }
      if (candidateEducation.includes(education)) {
        candidateLevel = Math.max(candidateLevel, level);
      }
    }
    
    if (vacancyLevel === 0 || candidateLevel === 0) {
      // Try field matching if levels not found
      const fields = ['engineering', 'computer science', 'business', 'management', 'technical', 'finance', 'marketing'];
      let fieldMatch = false;
      
      for (const field of fields) {
        if (vacancyEducation.includes(field) && candidateEducation.includes(field)) {
          fieldMatch = true;
          break;
        }
      }
      
      return fieldMatch ? 75 : 25;
    }
    
    // Perfect match
    if (candidateLevel === vacancyLevel) {
      return 100;
    }
    
    // Higher education than required (slight bonus)
    if (candidateLevel > vacancyLevel) {
      const difference = candidateLevel - vacancyLevel;
      return Math.max(80, 100 - (difference * 5));
    }
    
    // Lower education than required (penalty)
    if (candidateLevel < vacancyLevel) {
      const difference = vacancyLevel - candidateLevel;
      return Math.max(0, 100 - (difference * 25));
    }
    
    return 50;
  }

  /**
   * Industry/domain matching (5% weight)
   */
  private static calculateIndustryMatch(candidate: Candidate, vacancy: Vacancy): number {
    if (!vacancy.organization && !vacancy.department) return 50;

    const vacancyContext = [vacancy.organization, vacancy.department].filter(Boolean).join(' ').toLowerCase();
    const candidateContext = [
      candidate.company,
      candidate.branche,
      candidate.profileSummary
    ].filter(Boolean).join(' ').toLowerCase();

    if (!candidateContext) return 0;

    // Industry keyword matching
    const industryKeywords = {
      'datacenter': ['data center', 'infrastructure', 'hosting', 'cloud'],
      'technology': ['tech', 'it', 'software', 'digital'],
      'facility': ['building', 'maintenance', 'operations', 'management'],
      'engineering': ['technical', 'mechanical', 'electrical', 'civil']
    };

    let score = 0;

    for (const [industry, keywords] of Object.entries(industryKeywords)) {
      if (vacancyContext.includes(industry)) {
        for (const keyword of keywords) {
          if (candidateContext.includes(keyword)) {
            score = Math.max(score, 75);
          }
        }
      }
    }

    // Fallback: general text similarity
    if (score === 0) {
      score = compareTwoStrings(vacancyContext, candidateContext) * 100;
    }

    return Math.min(score, 100);
  }

  /**
   * Extract candidate skills from various profile fields with quality filtering
   */
  private static extractCandidateSkills(candidate: Candidate): string[] {
    const skills = new Set<string>();
    
    // Add explicit skills with filtering
    (candidate.skills || []).forEach(skill => {
      const cleanSkill = skill.trim().toLowerCase();
      if (this.isValidSkill(cleanSkill)) {
        skills.add(skill.trim());
      }
    });
    
    // Extract skills from text fields using NLP and keyword detection
    const textFields = [
      candidate.titleDescription,
      candidate.profileSummary,
      candidate.jobTitle,
      candidate.pastRoleTitle
    ].filter(Boolean);
    
    for (const text of textFields) {
      this.extractSkillsFromText(text!, skills);
    }
    
    return Array.from(skills);
  }

  /**
   * Validate if a string is a legitimate skill
   */
  private static isValidSkill(skill: string): boolean {
    const trimmedSkill = skill.trim().toLowerCase();
    
    // Filter out empty, too short, or non-skill words
    if (trimmedSkill.length < 2) return false;
    if (this.nonSkillWords.has(trimmedSkill)) return false;
    
    // Filter out purely numeric values
    if (/^\d+$/.test(trimmedSkill)) return false;
    
    // Filter out single characters or very common words
    if (trimmedSkill.length === 1) return false;
    
    // Allow technical skills, even if they're also common words
    if (this.technicalSkills.has(trimmedSkill)) return true;
    
    // Filter out known soft skills during extraction (but allow them for matching)
    if (this.softSkills.has(trimmedSkill)) return false;
    
    return true;
  }

  /**
   * Extract skills from text using keyword matching
   */
  private static extractSkillsFromText(text: string, skills: Set<string>): void {
    const lowerText = text.toLowerCase();
    
    // Check for technical skills in text
    Array.from(this.technicalSkills).forEach(skill => {
      if (lowerText.includes(skill)) {
        skills.add(skill);
      }
    });
    
    // Check for synonyms
    for (const [skill, synonyms] of Object.entries(this.skillSynonyms)) {
      for (const synonym of synonyms) {
        if (lowerText.includes(synonym)) {
          skills.add(skill);
        }
      }
    }
  }

  /**
   * Build comprehensive candidate skills text for matching
   */
  private static buildCandidateSkillsText(candidate: Candidate): string {
    const candidateSkillSources = [
      ...(candidate.skills || []),
      candidate.titleDescription || '',
      candidate.profileSummary || '',
      candidate.jobTitle || '',
      candidate.pastRoleTitle || ''
    ].filter(Boolean);
    
    return candidateSkillSources.join(' ').toLowerCase();
  }

  /**
   * Find direct skill match with source tracking
   */
  private static findDirectMatch(skill: string, candidate: Candidate): { context: string; location: string } | null {
    const skillLower = skill.toLowerCase();
    
    // Check job title
    if (candidate.jobTitle?.toLowerCase().includes(skillLower)) {
      return {
        context: candidate.jobTitle,
        location: "Job Title"
      };
    }
    
    // Check title description
    if (candidate.titleDescription?.toLowerCase().includes(skillLower)) {
      const sentences = candidate.titleDescription.split(/[.!?]+/);
      const matchingSentence = sentences.find(s => s.toLowerCase().includes(skillLower));
      return {
        context: matchingSentence?.trim() || candidate.titleDescription.substring(0, 100) + "...",
        location: "Job Description"
      };
    }
    
    // Check profile summary
    if (candidate.profileSummary?.toLowerCase().includes(skillLower)) {
      const sentences = candidate.profileSummary.split(/[.!?]+/);
      const matchingSentence = sentences.find(s => s.toLowerCase().includes(skillLower));
      return {
        context: matchingSentence?.trim() || candidate.profileSummary.substring(0, 100) + "...",
        location: "Profile Summary"
      };
    }
    
    // Check past role title
    if (candidate.pastRoleTitle?.toLowerCase().includes(skillLower)) {
      return {
        context: candidate.pastRoleTitle,
        location: "Previous Role"
      };
    }
    
    // Check listed skills
    const matchingSkill = candidate.skills?.find(s => s.toLowerCase().includes(skillLower));
    if (matchingSkill) {
      return {
        context: matchingSkill,
        location: "Listed Skills"
      };
    }
    
    return null;
  }

  /**
   * Find synonym match with source tracking
   */
  private static findSynonymMatch(skill: string, candidate: Candidate): { context: string; location: string; synonym: string } | null {
    const synonyms = this.skillSynonyms[skill] || [];
    
    for (const synonym of synonyms) {
      const synonymLower = synonym.toLowerCase();
      
      // Check job title
      if (candidate.jobTitle?.toLowerCase().includes(synonymLower)) {
        return {
          context: candidate.jobTitle,
          location: "Job Title",
          synonym
        };
      }
      
      // Check title description
      if (candidate.titleDescription?.toLowerCase().includes(synonymLower)) {
        const sentences = candidate.titleDescription.split(/[.!?]+/);
        const matchingSentence = sentences.find(s => s.toLowerCase().includes(synonymLower));
        return {
          context: matchingSentence?.trim() || candidate.titleDescription.substring(0, 100) + "...",
          location: "Job Description",
          synonym
        };
      }
      
      // Check profile summary
      if (candidate.profileSummary?.toLowerCase().includes(synonymLower)) {
        const sentences = candidate.profileSummary.split(/[.!?]+/);
        const matchingSentence = sentences.find(s => s.toLowerCase().includes(synonymLower));
        return {
          context: matchingSentence?.trim() || candidate.profileSummary.substring(0, 100) + "...",
          location: "Profile Summary",
          synonym
        };
      }
    }
    
    return null;
  }

  /**
   * Analyze skill match with enhanced source tracking and transparency
   */
  private static analyzeSkillMatch(vacancySkill: string, candidateText: string, candidateSkills: string[], candidate: Candidate): SkillMatch | null {
    const skillLower = vacancySkill.toLowerCase();
    
    // Check direct match with source tracking
    const directMatchResult = this.findDirectMatch(skillLower, candidate);
    if (directMatchResult) {
      return {
        skill: vacancySkill,
        relevance: 'strong',
        similarity: 100,
        source: 'direct',
        sourceContext: directMatchResult.context,
        sourceLocation: directMatchResult.location
      };
    }
    
    // Check synonym matches with source tracking
    const synonymMatchResult = this.findSynonymMatch(skillLower, candidate);
    if (synonymMatchResult) {
      return {
        skill: vacancySkill,
        relevance: 'strong',
        similarity: 95,
        source: 'synonym',
        sourceContext: `"${synonymMatchResult.synonym}" → ${synonymMatchResult.context}`,
        sourceLocation: synonymMatchResult.location
      };
    }
    
    // Fuzzy matching (partial to weak)
    let bestSimilarity = 0;
    for (const candidateSkill of candidateSkills) {
      const candidateSkillLower = candidateSkill.toLowerCase();
      if (this.isTechnicalSkill(candidateSkillLower)) {
        const similarity = Math.round(compareTwoStrings(skillLower, candidateSkillLower) * 100);
        bestSimilarity = Math.max(bestSimilarity, similarity);
      }
    }
    
    if (bestSimilarity >= 80) {
      return {
        skill: vacancySkill,
        relevance: 'strong',
        similarity: Math.round(bestSimilarity),
        source: 'fuzzy'
      };
    } else if (bestSimilarity >= 50) {
      return {
        skill: vacancySkill,
        relevance: 'partial',
        similarity: Math.round(bestSimilarity),
        source: 'fuzzy'
      };
    } else if (bestSimilarity >= 1) {
      return {
        skill: vacancySkill,
        relevance: 'weak',
        similarity: Math.round(bestSimilarity),
        source: 'fuzzy'
      };
    }
    
    // No match found
    return {
      skill: vacancySkill,
      relevance: 'weak',
      similarity: 0,
      source: 'direct'
    };
  }

  /**
   * Calculate candidate skill relevance to vacancy
   */
  private static calculateCandidateSkillRelevance(candidateSkill: string, vacancySkills: string[]): 'strong' | 'partial' | 'weak' {
    const skillLower = candidateSkill.toLowerCase();
    
    // Direct match
    for (const vacancySkill of vacancySkills) {
      if (vacancySkill.toLowerCase() === skillLower) {
        return 'strong';
      }
    }
    
    // Synonym match
    for (const vacancySkill of vacancySkills) {
      const synonyms = this.skillSynonyms[vacancySkill.toLowerCase()] || [];
      if (synonyms.includes(skillLower)) {
        return 'strong';
      }
    }
    
    // Fuzzy match
    let bestSimilarity = 0;
    for (const vacancySkill of vacancySkills) {
      const similarity = Math.round(compareTwoStrings(skillLower, vacancySkill.toLowerCase()) * 100);
      bestSimilarity = Math.max(bestSimilarity, similarity);
    }
    
    if (bestSimilarity >= 80) return 'strong';
    if (bestSimilarity >= 50) return 'partial';
    if (bestSimilarity >= 1) return 'weak';
    
    // Check if it's a related technology (only if similarity is at least 1%)
    if (bestSimilarity >= 1) {
      const relatedCategories = this.getSkillCategory(skillLower);
      for (const vacancySkill of vacancySkills) {
        const vacancyCategories = this.getSkillCategory(vacancySkill.toLowerCase());
        if (relatedCategories.some(cat => vacancyCategories.includes(cat))) {
          return 'partial';
        }
      }
    }
    
    return 'weak';
  }

  /**
   * Get best similarity score between candidate skill and vacancy skills
   */
  private static getBestSimilarity(candidateSkill: string, vacancySkills: string[]): number {
    let bestSimilarity = 0;
    const candidateSkillLower = candidateSkill.toLowerCase();
    
    for (const vacancySkill of vacancySkills) {
      const similarity = Math.round(compareTwoStrings(candidateSkillLower, vacancySkill.toLowerCase()) * 100);
      bestSimilarity = Math.max(bestSimilarity, similarity);
    }
    
    return Math.round(bestSimilarity);
  }

  /**
   * Get skill category for related skill detection
   */
  private static getSkillCategory(skill: string): string[] {
    const categories: { [key: string]: string[] } = {
      'frontend': ['javascript', 'typescript', 'react', 'angular', 'vue', 'html', 'css', 'sass'],
      'backend': ['node.js', 'python', 'java', 'c#', 'php', 'ruby', 'go', 'express', 'django'],
      'database': ['mysql', 'postgresql', 'mongodb', 'redis', 'sqlite', 'oracle'],
      'cloud': ['aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform'],
      'hvac': ['heating', 'ventilation', 'air conditioning', 'climate control', 'chiller'],
      'electrical': ['electrical', 'power', 'voltage', 'current', 'generator', 'transformer'],
      'security': ['cctv', 'surveillance', 'access control', 'fire safety', 'alarm systems']
    };
    
    const result: string[] = [];
    for (const [category, skills] of Object.entries(categories)) {
      if (skills.some(s => skill.includes(s) || s.includes(skill))) {
        result.push(category);
      }
    }
    
    return result;
  }

  /**
   * Enhanced location matching with remote work and distance calculations
   */
  private static calculateEnhancedLocationMatch(candidate: Candidate, vacancy: Vacancy): { score: number; explanation: string } {
    if (!vacancy.location) return { score: 0, explanation: 'No vacancy location specified' };

    const vacancyLocation = vacancy.location.toLowerCase();
    const candidateLocations = [
      candidate.location,
      candidate.companyLocation,
    ].filter(Boolean).map(loc => loc!.toLowerCase());

    if (candidateLocations.length === 0) {
      return { score: 0, explanation: 'No candidate location information' };
    }

    let bestScore = 0;
    let explanation = '';

    for (const candidateLocation of candidateLocations) {
      // Remote work detection
      if (candidateLocation.includes('remote') || vacancyLocation.includes('remote')) {
        bestScore = Math.max(bestScore, 90);
        explanation = 'Remote work compatible';
        continue;
      }

      // Same city/exact match
      if (candidateLocation.includes(vacancyLocation) || vacancyLocation.includes(candidateLocation)) {
        bestScore = Math.max(bestScore, 100);
        explanation = 'Same city match';
        continue;
      }

      // Same region/country matching
      for (const [country, cities] of Object.entries(this.locationRegions)) {
        const vacancyInCountry = cities.some(city => vacancyLocation.includes(city)) || vacancyLocation.includes(country);
        const candidateInCountry = cities.some(city => candidateLocation.includes(city)) || candidateLocation.includes(country);

        if (vacancyInCountry && candidateInCountry) {
          bestScore = Math.max(bestScore, 60);
          explanation = `Same country (${country})`;
        }
      }

      // EU proximity check
      const euCountries = ['germany', 'netherlands', 'belgium', 'france', 'sweden', 'switzerland', 'austria', 'denmark'];
      const vacancyInEU = euCountries.some(country => vacancyLocation.includes(country));
      const candidateInEU = euCountries.some(country => candidateLocation.includes(country));

      if (vacancyInEU && candidateInEU && bestScore < 60) {
        bestScore = 30;
        explanation = 'EU proximity';
      }
    }

    return { score: bestScore, explanation };
  }

  /**
   * Enhanced experience matching with domain relevance
   */
  private static calculateEnhancedExperienceMatch(candidate: Candidate, vacancy: Vacancy): { score: number; explanation: string } {
    if (!vacancy.experienceLevel) {
      return { score: 0, explanation: 'No experience level specified' };
    }

    const vacancyLevel = vacancy.experienceLevel.toLowerCase();
    const experienceRange = this.experienceLevels[vacancyLevel];

    if (!experienceRange) {
      return { score: 0, explanation: 'Unknown experience level requirement' };
    }

    // Calculate total experience from various sources
    let totalExperience = candidate.experience || 0;
    let domainExperience = 0;

    // Parse duration strings to extract years
    const durationSources = [
      candidate.durationCurrentRole,
      candidate.durationAtCompany,
      candidate.pastExperienceDuration
    ].filter(Boolean);

    for (const duration of durationSources) {
      const years = this.parseDurationToYears(duration!);
      totalExperience = Math.max(totalExperience, years);
    }

    // Calculate domain-specific experience
    if (candidate.titleDescription && vacancy.title) {
      const relevantKeywords = vacancy.title.toLowerCase().split(' ');
      const candidateText = candidate.titleDescription.toLowerCase();
      const relevantMatches = relevantKeywords.filter(keyword => 
        candidateText.includes(keyword) && keyword.length > 2
      ).length;
      
      if (relevantMatches > 0) {
        domainExperience = totalExperience * (relevantMatches / relevantKeywords.length);
      }
    }

    // Check for experience indicators in titles
    const titleSources = [candidate.jobTitle, candidate.pastRoleTitle].filter(Boolean);
    for (const title of titleSources) {
      const titleLower = title!.toLowerCase();
      if (titleLower.includes('senior') || titleLower.includes('lead')) {
        totalExperience = Math.max(totalExperience, 5);
      } else if (titleLower.includes('manager') || titleLower.includes('director')) {
        totalExperience = Math.max(totalExperience, 7);
      } else if (titleLower.includes('junior') && totalExperience < 3) {
        totalExperience = Math.max(totalExperience, 1);
      }
    }

    const effectiveExperience = Math.max(totalExperience, domainExperience);
    
    // Score based on how well experience matches the required range
    if (effectiveExperience >= experienceRange.min && effectiveExperience <= experienceRange.max) {
      return { 
        score: 100, 
        explanation: `Perfect match: ${effectiveExperience} years (${experienceRange.min}-${experienceRange.max} required)` 
      };
    } else if (effectiveExperience < experienceRange.min) {
      const gap = experienceRange.min - effectiveExperience;
      const score = Math.max(0, 100 - (gap * 20));
      return { 
        score, 
        explanation: `Under-experienced: ${effectiveExperience} years (${experienceRange.min}+ required)` 
      };
    } else {
      const excess = effectiveExperience - experienceRange.max;
      const score = Math.max(50, 100 - (excess * 10));
      return { 
        score, 
        explanation: `Over-experienced: ${effectiveExperience} years (${experienceRange.min}-${experienceRange.max} preferred)` 
      };
    }
  }

  /**
   * Generate comprehensive match explanation
   */
  private static generateMatchExplanation(criteria: MatchingCriteria, weights: MatchingWeights, totalScore: number): string {
    const explanations = [];
    
    if (criteria.skillsScore >= 80) {
      explanations.push(`Strong skills match (${criteria.skillsScore}%)`);
    } else if (criteria.skillsScore >= 60) {
      explanations.push(`Good skills overlap (${criteria.skillsScore}%)`);
    } else if (criteria.skillsScore < 40) {
      explanations.push(`Limited skills match (${criteria.skillsScore}%)`);
    }
    
    if (criteria.locationScore >= 80) {
      explanations.push(`Excellent location fit`);
    } else if (criteria.locationScore >= 50) {
      explanations.push(`Acceptable location`);
    } else if (criteria.locationScore < 30) {
      explanations.push(`Location mismatch`);
    }
    
    if (criteria.experienceScore >= 90) {
      explanations.push(`Perfect experience level`);
    } else if (criteria.experienceScore >= 70) {
      explanations.push(`Good experience match`);
    } else if (criteria.experienceScore < 50) {
      explanations.push(`Experience gap`);
    }
    
    const topWeight = Math.max(weights.skills, weights.location, weights.experience, weights.title);
    if (topWeight === weights.skills) {
      explanations.push(`Skills-focused role`);
    } else if (topWeight === weights.location) {
      explanations.push(`Location-critical role`);
    } else if (topWeight === weights.experience) {
      explanations.push(`Experience-focused role`);
    }
    
    return explanations.join(', ');
  }

  /**
   * Parse duration strings to extract years of experience
   */
  private static parseDurationToYears(duration: string): number {
    const yearMatch = duration.match(/(\d+)\s*year/i);
    const monthMatch = duration.match(/(\d+)\s*month/i);

    let years = 0;
    if (yearMatch) years += parseInt(yearMatch[1]);
    if (monthMatch) years += parseInt(monthMatch[1]) / 12;

    return years;
  }
}