import { ISubdomainService } from '../../domain/services/ISubdomainService';

export class SubdomainService implements ISubdomainService {
  private readonly adjectives = [
    'happy', 'swift', 'bold', 'calm', 'bright', 'clever', 'eager', 'fancy',
    'gentle', 'jolly', 'kind', 'lively', 'merry', 'nice', 'proud', 'quiet',
    'rapid', 'silly', 'tender', 'vivid', 'warm', 'witty', 'brave', 'cool',
    'fair', 'fine', 'glad', 'good', 'keen', 'neat', 'pure', 'safe',
    'sane', 'tame', 'true', 'vast', 'wise', 'young', 'zesty', 'able',
    'agile', 'epic', 'free', 'huge', 'mild', 'noble', 'rich', 'smart',
    'wild', 'grand'
  ];

  private readonly nouns = [
    'cloud', 'river', 'mountain', 'forest', 'star', 'ocean', 'garden', 'valley',
    'meadow', 'lake', 'island', 'stream', 'canyon', 'peak', 'hill', 'plain',
    'desert', 'field', 'grove', 'harbor', 'lagoon', 'marsh', 'pond', 'reef',
    'shore', 'summit', 'trail', 'wave', 'bay', 'coast', 'creek', 'delta',
    'dune', 'falls', 'fjord', 'glade', 'gorge', 'inlet', 'mesa', 'oasis',
    'ridge', 'slope', 'spring', 'stone', 'tundra', 'vista', 'woods', 'bluff',
    'cliff', 'cove'
  ];

  private readonly maxAttempts = 10;
  private readonly minNumber = 1;
  private readonly maxNumber = 999;

  async generateUniqueSubdomain(
    checkExists: (subdomain: string) => Promise<boolean>
  ): Promise<string> {
    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      const subdomain = this.generateSubdomain();
      const exists = await checkExists(subdomain);

      if (!exists) {
        return subdomain;
      }
    }

    throw new Error(
      `Failed to generate unique subdomain after ${this.maxAttempts} attempts`
    );
  }

  private generateSubdomain(): string {
    const adjective = this.randomElement(this.adjectives);
    const noun = this.randomElement(this.nouns);
    const number = this.randomNumber(this.minNumber, this.maxNumber);

    return `${adjective}-${noun}-${number}`;
  }

  private randomElement<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }

  private randomNumber(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}
