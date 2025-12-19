export type InspoType = 'LANDING_PAGE';

export interface Inspo {
  id: string;
  name: string;
  type: InspoType;
  mimeType: string;
  fileName: string;
  imageUrl: string; // Computed: https://media.huskystudio.ai/inspo/landing-pages/760x950/{fileName}
  createdAt: Date;
  modifiedAt: Date;
}
