import { Resolver } from 'dns/promises';
import { ConsoleLogger } from '../../shared/logger/Logger';

export interface DNSVerificationResult {
  verified: boolean;
  actualTarget?: string;
  error?: string;
}

export type DNSProvider =
  | 'cloudflare'
  | 'godaddy'
  | 'namecheap'
  | 'route53'
  | 'vercel'
  | 'digitalocean'
  | 'hover'
  | 'squarespace'
  | 'unknown';

export interface IDNSVerificationService {
  verifyCNAME(domain: string, expectedTarget: string): Promise<DNSVerificationResult>;
  detectProvider(domain: string): Promise<DNSProvider>;
}

const PUBLIC_FALLBACK_RESOLVERS = ['1.1.1.1', '8.8.8.8'];

const DNS_TIMEOUT_MS = 3000;

/**
 * Cloudflare's published anycast IPv4 ranges. If the customer's CNAME isn't
 * visible but the domain resolves to one of these IPs, their CNAME exists but
 * is proxied (orange cloud) — Cloudflare flattens it server-side and answers
 * with the proxy IPs instead of the CNAME. We emit a specific error so the
 * customer knows to switch to grey cloud.
 *
 * Source: https://www.cloudflare.com/ips-v4
 */
const CLOUDFLARE_IPV4_RANGES: Array<[number, number]> = [
  [ipv4ToInt('103.21.244.0'), ipv4ToInt('103.21.247.255')],
  [ipv4ToInt('103.22.200.0'), ipv4ToInt('103.22.203.255')],
  [ipv4ToInt('103.31.4.0'), ipv4ToInt('103.31.7.255')],
  [ipv4ToInt('104.16.0.0'), ipv4ToInt('104.31.255.255')],
  [ipv4ToInt('108.162.192.0'), ipv4ToInt('108.162.255.255')],
  [ipv4ToInt('131.0.72.0'), ipv4ToInt('131.0.75.255')],
  [ipv4ToInt('141.101.64.0'), ipv4ToInt('141.101.127.255')],
  [ipv4ToInt('162.158.0.0'), ipv4ToInt('162.159.255.255')],
  [ipv4ToInt('172.64.0.0'), ipv4ToInt('172.71.255.255')],
  [ipv4ToInt('173.245.48.0'), ipv4ToInt('173.245.63.255')],
  [ipv4ToInt('188.114.96.0'), ipv4ToInt('188.114.111.255')],
  [ipv4ToInt('190.93.240.0'), ipv4ToInt('190.93.255.255')],
  [ipv4ToInt('197.234.240.0'), ipv4ToInt('197.234.243.255')],
  [ipv4ToInt('198.41.128.0'), ipv4ToInt('198.41.255.255')],
];

function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isCloudflareIP(ip: string): boolean {
  const n = ipv4ToInt(ip);
  return CLOUDFLARE_IPV4_RANGES.some(([lo, hi]) => n >= lo && n <= hi);
}

/** Distinguish "auth NS unreachable" from "auth NS said no record." */
class AuthoritativeUnreachable extends Error {}

export class DNSVerificationService implements IDNSVerificationService {
  private logger: ConsoleLogger;

  constructor() {
    this.logger = new ConsoleLogger();
  }

  /**
   * Verifies that a domain's CNAME record points to the expected target.
   *
   * Resolution strategy:
   *   1. Find the customer's authoritative nameservers by walking up the
   *      domain's labels. Query CNAME directly against them — this bypasses
   *      every recursive cache (notably Cloud Run's resolver, which has been
   *      observed to cache NODATA responses for hours, making "domain just
   *      added the CNAME but verify still says missing" a frequent support
   *      case).
   *   2. If the authoritative answer is "no CNAME," check the A records. If
   *      they point at Cloudflare's anycast ranges, the customer's record
   *      exists but is proxied (orange cloud) — return a specific error
   *      asking them to switch to DNS-only.
   *   3. If we can't reach authoritative NS at all, fall back to 1.1.1.1 /
   *      8.8.8.8 — still better than the system resolver because Cloudflare
   *      runs short negative TTLs for its own zones (and ours).
   */
  async verifyCNAME(domain: string, expectedTarget: string): Promise<DNSVerificationResult> {
    this.logger.info(`Verifying CNAME for ${domain}, expecting ${expectedTarget}`);

    let records: string[] | null = null;
    let aRecords: string[] = [];

    try {
      records = await this.resolveCNAMEAuthoritative(domain);
    } catch (err: any) {
      if (err instanceof AuthoritativeUnreachable) {
        this.logger.warn(
          `Authoritative NS lookup failed for ${domain} (${err.message}); falling back to public resolver`
        );
        try {
          records = await this.resolveCNAMEPublic(domain);
        } catch (fallbackErr: any) {
          if (this.isNoData(fallbackErr) || this.isNotFound(fallbackErr)) {
            records = null;
          } else if (fallbackErr.code === 'ETIMEOUT') {
            return {
              verified: false,
              error: 'DNS lookup timed out. Please try again in a moment.'
            };
          } else {
            this.logger.error(`Fallback DNS lookup error for ${domain}:`, fallbackErr);
            return { verified: false, error: `DNS lookup failed: ${fallbackErr.message}` };
          }
        }
      } else if (this.isNoData(err) || this.isNotFound(err)) {
        // Authoritative answered "no CNAME" — that's the truth, not a transient
        // error. Drop into the proxied-CNAME / "no record" branch below.
        records = null;
      } else if (err.code === 'ETIMEOUT') {
        return {
          verified: false,
          error: 'DNS lookup timed out. Please try again in a moment.'
        };
      } else {
        this.logger.error(`DNS verification error for ${domain}:`, err);
        return { verified: false, error: `DNS lookup failed: ${err.message}` };
      }
    }

    if (records && records.length > 0) {
      const normalizedExpected = this.normalizeDomain(expectedTarget);
      const normalizedRecords = records.map(r => this.normalizeDomain(r));
      this.logger.info(`Found CNAME records for ${domain}: ${normalizedRecords.join(', ')}`);

      if (normalizedRecords.includes(normalizedExpected)) {
        return { verified: true, actualTarget: records[0] };
      }
      return {
        verified: false,
        actualTarget: records[0],
        error: `CNAME points to ${records[0]}, but should point to ${expectedTarget}`
      };
    }

    // No CNAME found. Before declaring it missing, check whether the domain
    // resolves to Cloudflare IPs — that signals an orange-cloud proxied CNAME
    // on the customer's zone.
    try {
      aRecords = await this.resolveAPublic(domain);
    } catch {
      aRecords = [];
    }

    if (aRecords.length > 0 && aRecords.every(isCloudflareIP)) {
      this.logger.info(
        `${domain} has no visible CNAME but resolves to Cloudflare IPs (${aRecords.join(', ')}); likely proxied`
      );
      return {
        verified: false,
        error:
          `Found a record for ${domain} but it's behind a Cloudflare proxy (orange cloud). ` +
          `Open your Cloudflare DNS settings, find the CNAME for this hostname, and switch it to "DNS only" (grey cloud). ` +
          `Cloudflare-for-SaaS needs an unproxied CNAME pointing to ${expectedTarget}.`
      };
    }

    return {
      verified: false,
      error: `No CNAME record found. Please add a CNAME record pointing to ${expectedTarget}.`
    };
  }

  /**
   * Query CNAME against the customer's own authoritative nameservers. Throws
   * AuthoritativeUnreachable when we couldn't even find/reach the NS — the
   * caller should fall back. Other DNS errors (NODATA, NOTFOUND) propagate so
   * the caller can treat them as authoritative answers.
   */
  private async resolveCNAMEAuthoritative(domain: string): Promise<string[]> {
    const nsHosts = await this.findAuthoritativeNS(domain);
    if (nsHosts.length === 0) {
      throw new AuthoritativeUnreachable('no NS records found walking up labels');
    }

    const nsIPs = await this.resolveNSToIPs(nsHosts);
    if (nsIPs.length === 0) {
      throw new AuthoritativeUnreachable(`could not resolve any of [${nsHosts.join(', ')}] to IPs`);
    }

    const authResolver = new Resolver({ timeout: DNS_TIMEOUT_MS, tries: 1 });
    authResolver.setServers(nsIPs);
    return authResolver.resolveCname(domain);
  }

  /**
   * Walk up labels (e.g. www.foo.example.com → foo.example.com → example.com)
   * and return the first level that has NS records. That's the closest
   * enclosing zone — its NS are authoritative for everything under it.
   */
  private async findAuthoritativeNS(domain: string): Promise<string[]> {
    const publicResolver = this.makePublicResolver();
    const labels = domain.split('.');

    for (let i = 0; i < labels.length - 1; i++) {
      const candidate = labels.slice(i).join('.');
      try {
        const ns = await publicResolver.resolveNs(candidate);
        if (ns && ns.length > 0) {
          this.logger.info(`Authoritative NS for ${domain} found at zone ${candidate}: ${ns.join(', ')}`);
          return ns;
        }
      } catch (err: any) {
        if (this.isNoData(err) || this.isNotFound(err)) continue;
        throw new AuthoritativeUnreachable(`NS lookup failed for ${candidate}: ${err.message}`);
      }
    }

    return [];
  }

  private async resolveNSToIPs(nsHosts: string[]): Promise<string[]> {
    const publicResolver = this.makePublicResolver();
    const results = await Promise.allSettled(nsHosts.map(host => publicResolver.resolve4(host)));
    return results.flatMap(r => (r.status === 'fulfilled' ? r.value : []));
  }

  private async resolveCNAMEPublic(domain: string): Promise<string[]> {
    return this.makePublicResolver().resolveCname(domain);
  }

  private async resolveAPublic(domain: string): Promise<string[]> {
    return this.makePublicResolver().resolve4(domain);
  }

  private makePublicResolver(): Resolver {
    const resolver = new Resolver({ timeout: DNS_TIMEOUT_MS, tries: 2 });
    resolver.setServers(PUBLIC_FALLBACK_RESOLVERS);
    return resolver;
  }

  private isNoData(err: any): boolean {
    return err?.code === 'ENODATA';
  }

  private isNotFound(err: any): boolean {
    return err?.code === 'ENOTFOUND' || err?.code === 'NOTFOUND';
  }

  private normalizeDomain(domain: string): string {
    return domain.toLowerCase().replace(/\.$/, '');
  }

  /**
   * Detect which DNS provider hosts the customer's zone by inspecting the NS
   * records of the closest enclosing zone. Used to surface the right
   * provider-specific setup instructions in the UI. Returns 'unknown' on any
   * failure rather than throwing — this is purely a UX hint, never blocking.
   */
  async detectProvider(domain: string): Promise<DNSProvider> {
    try {
      const ns = (await this.findAuthoritativeNS(domain)).map(host => host.toLowerCase());
      if (ns.length === 0) return 'unknown';

      if (ns.some(h => h.endsWith('.ns.cloudflare.com'))) return 'cloudflare';
      if (ns.some(h => h.endsWith('.domaincontrol.com'))) return 'godaddy';
      if (ns.some(h => h.endsWith('.registrar-servers.com'))) return 'namecheap';
      if (ns.some(h => /\.awsdns-\d+\.(com|net|org|co\.uk)$/.test(h))) return 'route53';
      if (ns.some(h => h.endsWith('.vercel-dns.com'))) return 'vercel';
      if (ns.some(h => h.endsWith('.digitalocean.com'))) return 'digitalocean';
      if (ns.some(h => h.endsWith('.hover.com'))) return 'hover';
      if (ns.some(h => h.endsWith('.squarespacedns.com'))) return 'squarespace';
      return 'unknown';
    } catch (err) {
      this.logger.warn(`detectProvider(${domain}) failed:`, err);
      return 'unknown';
    }
  }
}
