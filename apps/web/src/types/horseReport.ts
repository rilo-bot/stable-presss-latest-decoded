export type ReportDocType =
  | 'Registration'
  | 'Passport'
  | 'Vet Report'
  | 'Vaccination'
  | 'X-Ray / Scan'
  | 'Stable Return'
  | 'Other';

export const REPORT_DOC_TYPES: ReportDocType[] = [
  'Registration',
  'Passport',
  'Vet Report',
  'Vaccination',
  'X-Ray / Scan',
  'Stable Return',
  'Other',
];

export type ReportVisibility = 'public' | 'restricted';

export interface HorseReport {
  id: string;
  createdAt: Date;

  /** Required — Horse ID this document is attached to */
  horse_id: string;

  /** Required — Type of document */
  doc_type: ReportDocType;

  /** Required — Document title */
  title: string;

  /** Optional — ISO date string YYYY-MM-DD */
  issued_date?: string;

  /** Optional — Issuing body (e.g. Racing Australia, NZTR, a vet practice) */
  issuing_body?: string;

  /** Optional — Link to the document */
  url?: string;

  /** Optional — Uploaded file reference */
  file_name?: string;

  /**
   * Visibility. 'restricted' documents are only shown to authenticated users
   * (per the FR spec: strictly available to authorised people).
   */
  visibility: ReportVisibility;
}
