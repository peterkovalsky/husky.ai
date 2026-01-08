import { promises as dns } from 'dns';
import { ConsoleLogger } from '../../shared/logger/Logger';

export interface DNSVerificationResult {
  verified: boolean;
  actualTarget?: string;
  error?: string;
}

export interface IDNSVerificationService {
  verifyCNAME(domain: string, expectedTarget: string): Promise<DNSVerificationResult>;
}

export class DNSVerificationService implements IDNSVerificationService {
  private logger: ConsoleLogger;

  constructor() {
    this.logger = new ConsoleLogger();
  }

  /**
   * Verifies that a domain's CNAME record points to the expected target
   * @param domain - The domain to verify (e.g., "www.example.com")
   * @param expectedTarget - The expected CNAME target (e.g., "happy-cloud-42.huskystudio.ai")
   * @returns DNSVerificationResult with verification status
   */
  async verifyCNAME(domain: string, expectedTarget: string): Promise<DNSVerificationResult> {
    try {
      this.logger.info(`Verifying CNAME for ${domain}, expecting ${expectedTarget}`);

      // Resolve CNAME records for the domain
      const records = await dns.resolveCname(domain);

      if (!records || records.length === 0) {
        return {
          verified: false,
          error: 'No CNAME record found. Please add a CNAME record pointing to ' + expectedTarget
        };
      }

      // Check if any of the CNAME records match the expected target
      // Normalize by removing trailing dots and converting to lowercase
      const normalizedExpected = this.normalizeDomain(expectedTarget);
      const normalizedRecords = records.map(r => this.normalizeDomain(r));

      this.logger.info(`Found CNAME records: ${normalizedRecords.join(', ')}`);

      const verified = normalizedRecords.includes(normalizedExpected);

      if (verified) {
        return {
          verified: true,
          actualTarget: records[0]
        };
      } else {
        return {
          verified: false,
          actualTarget: records[0],
          error: `CNAME points to ${records[0]}, but should point to ${expectedTarget}`
        };
      }
    } catch (error: any) {
      // Handle specific DNS errors
      if (error.code === 'ENODATA') {
        return {
          verified: false,
          error: 'No CNAME record found. Please add a CNAME record pointing to ' + expectedTarget
        };
      } else if (error.code === 'ENOTFOUND') {
        return {
          verified: false,
          error: 'Domain not found. Please check that the domain is correct.'
        };
      } else if (error.code === 'ETIMEOUT') {
        return {
          verified: false,
          error: 'DNS lookup timed out. Please try again in a few moments.'
        };
      } else {
        this.logger.error(`DNS verification error for ${domain}:`, error);
        return {
          verified: false,
          error: `DNS lookup failed: ${error.message}`
        };
      }
    }
  }

  /**
   * Normalizes a domain name by removing trailing dots and converting to lowercase
   * @param domain - The domain to normalize
   * @returns Normalized domain
   */
  private normalizeDomain(domain: string): string {
    return domain.toLowerCase().replace(/\.$/, '');
  }
}
