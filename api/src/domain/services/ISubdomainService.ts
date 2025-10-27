export interface ISubdomainService {
  /**
   * Generates a unique subdomain in the format ${adj}-${noun}-${num}
   * @param checkExists Function to check if subdomain is already taken
   * @returns A unique subdomain string
   * @throws Error if unable to generate unique subdomain after max attempts
   */
  generateUniqueSubdomain(checkExists: (subdomain: string) => Promise<boolean>): Promise<string>;
}
