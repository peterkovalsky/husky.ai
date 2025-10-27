import {
  Route53Client,
  ChangeResourceRecordSetsCommand,
  ListResourceRecordSetsCommand,
} from '@aws-sdk/client-route-53';
import { IRoute53Service } from '../../domain/services/IRoute53Service';
import dns from 'dns';
import { promisify } from 'util';

const resolveCname = promisify(dns.resolveCname);

export class Route53Service implements IRoute53Service {
  private client: Route53Client;
  private hostedZoneId: string;

  constructor() {
    const region = process.env.AWS_REGION;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    this.hostedZoneId = process.env.ROUTE53_HOSTED_ZONE_ID!;

    if (!this.hostedZoneId) {
      throw new Error('Missing ROUTE53_HOSTED_ZONE_ID environment variable');
    }

    if (!accessKeyId || !secretAccessKey) {
      throw new Error('Missing AWS credentials');
    }

    this.client = new Route53Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    console.log(`Route53Service initialized with hosted zone: ${this.hostedZoneId}`);
  }

  async createOrUpdateRecord(
    subdomain: string,
    publishDomain: string,
    cloudfrontDomain: string
  ): Promise<void> {
    const fullDomain = `${subdomain}.${publishDomain}`;

    const command = new ChangeResourceRecordSetsCommand({
      HostedZoneId: this.hostedZoneId,
      ChangeBatch: {
        Changes: [
          {
            Action: 'UPSERT',
            ResourceRecordSet: {
              Name: fullDomain,
              Type: 'A',
              AliasTarget: {
                HostedZoneId: 'Z2FDTNDATAQYW2', // CloudFront hosted zone ID (constant)
                DNSName: cloudfrontDomain,
                EvaluateTargetHealth: false,
              },
            },
          },
        ],
      },
    });

    try {
      await this.client.send(command);
      console.log(`Created/Updated Route53 A record for ${fullDomain} -> ${cloudfrontDomain}`);
    } catch (error) {
      throw new Error(
        `Failed to create/update Route53 record: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async deleteRecord(
    subdomain: string,
    publishDomain: string,
    cloudfrontDomain: string
  ): Promise<void> {
    const fullDomain = `${subdomain}.${publishDomain}`;

    const command = new ChangeResourceRecordSetsCommand({
      HostedZoneId: this.hostedZoneId,
      ChangeBatch: {
        Changes: [
          {
            Action: 'DELETE',
            ResourceRecordSet: {
              Name: fullDomain,
              Type: 'A',
              AliasTarget: {
                HostedZoneId: 'Z2FDTNDATAQYW2', // CloudFront hosted zone ID (constant)
                DNSName: cloudfrontDomain,
                EvaluateTargetHealth: false,
              },
            },
          },
        ],
      },
    });

    try {
      await this.client.send(command);
      console.log(`Deleted Route53 A record for ${fullDomain}`);
    } catch (error) {
      throw new Error(
        `Failed to delete Route53 record: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async checkDNSPropagation(fullDomain: string): Promise<boolean> {
    try {
      // Try to resolve the CNAME record
      // If the domain resolves to anything, DNS is working
      await resolveCname(fullDomain);
      return true;
    } catch (error) {
      // DNS not propagated yet or resolution failed
      return false;
    }
  }
}
