// ───────────────────────────── Domain types ─────────────────────────────

export type HolidayRegion = 'QLD' | 'NSW' | 'VIC' | 'National';

export type ClaimStatus = 'included' | 'review' | 'excluded';

export type DayType =
  | 'rostered'
  | 'one-off-work'
  | 'saturday-roster'
  | 'weekend'
  | 'non-rostered'
  | 'leave'
  | 'public-holiday';

export type TripRole = 'morning' | 'evening' | 'other';

/** Exact coordinates of a toll row within the original PDF (PDF points, top-left origin). */
export interface PdfCoords {
  page: number; // 1-based
  x: number;
  y: number; // top of the highlight box
  width: number;
  height: number;
  baseline: number;
  pageWidth: number;
  pageHeight: number;
  amountX?: number; // left edge of the dollar amount text
}

export interface TollTransaction {
  id: string;
  statementId: string;
  date: string; // yyyy-MM-dd
  time: string; // HH:mm:ss
  road: string; // motorway / network name
  tollPoint: string;
  direction: string;
  vehicleRego: string | null;
  tagNumber: string | null;
  transactionType: string;
  amount: number; // AUD inc GST
  gst: number; // amount / 11
  invoiceRef: string;
  accountNumber: string;
  rawText: string;
  pdfCoords: PdfCoords | null;
}

export interface TransactionOverride {
  included?: boolean;
  notes?: string;
  updatedAt: string;
}

/** Result of the detection engine for a single transaction. */
export interface TransactionAnalysis {
  confidence: number;
  status: ClaimStatus;
  aiRecommended: boolean;
  aiStatus: ClaimStatus;
  reasons: string[];
  summary: string;
  dayType: DayType;
  dayLabel: string;
  isWorkDay: boolean;
  tripRole: TripRole;
  tripId: string;
  manual: boolean;
  vehicleRegistered: boolean | null;
}

export type AnalysedTransaction = TollTransaction & TransactionAnalysis & { notes: string };

export interface TripSegment {
  id: string;
  date: string;
  start: string;
  end: string;
  role: TripRole;
  transactionIds: string[];
  total: number;
}

export interface DailyTripGroup {
  date: string;
  weekday: number;
  dayType: DayType;
  dayLabel: string;
  isWorkDay: boolean;
  likelyOfficeAttendance: boolean;
  transactions: AnalysedTransaction[];
  trips: TripSegment[];
  total: number;
  gst: number;
  claimedTotal: number;
  claimedCount: number;
  reviewCount: number;
  paired: boolean;
}

export interface CommuteProfile {
  morningStart: string; // HH:mm
  morningEnd: string;
  eveningStart: string;
  eveningEnd: string;
  tripGapMinutes: number; // max gap between tolls to be considered one trip
}

export type SaturdayRotation = 'every' | 'fortnightly-even' | 'fortnightly-odd' | 'custom';

export interface SaturdayRoster {
  enabled: boolean;
  shiftStart: string;
  shiftEnd: string;
  morningStart: string;
  morningEnd: string;
  eveningStart: string;
  eveningEnd: string;
  rotation: SaturdayRotation;
  customDates: string[];
}

export type RosterType = 'full-time' | 'hybrid' | 'nine-day-fortnight' | 'custom';

export interface RosterPattern {
  id: string;
  name: string;
  type: RosterType;
  weekdays: number[]; // 0=Sun … 6=Sat
  rdoWeekday?: number; // nine-day fortnight
  rdoAnchorDate?: string; // a known RDO date
}

export type LeaveType = 'Annual' | 'Sick' | 'RDO' | 'Personal' | 'Long Service' | 'Training' | 'Other';

export interface LeaveDate {
  id: string;
  date: string;
  type: LeaveType;
  note?: string;
}

export interface OneOffWorkDay {
  id: string;
  date: string;
  note?: string;
}

export interface PublicHoliday {
  date: string;
  name: string;
  region: HolidayRegion | 'Custom';
}

export interface VehicleEntry {
  id: string;
  plate: string;
  label?: string;
}

export interface TagEntry {
  id: string;
  tagNumber: string;
  plate?: string;
  label?: string;
}

export interface EmployeeProfile {
  employeeName: string;
  employeeId: string;
  email: string;
  costCenter: string;
  department: string;
  company: string;
  managerName: string;
  managerEmail: string;
  managerTitle: string;
}

export type HighlightStyle = 'emerald' | 'yellow' | 'margin';

export interface UserSettings {
  profile: EmployeeProfile;
  holidayRegion: HolidayRegion;
  rosterPatterns: RosterPattern[];
  activeRosterId: string;
  commute: CommuteProfile;
  saturday: SaturdayRoster;
  leaveDates: LeaveDate[];
  oneOffWorkDays: OneOffWorkDay[];
  customHolidays: PublicHoliday[];
  vehicles: VehicleEntry[];
  tags: TagEntry[];
  autoSelectHighConfidence: boolean;
  onlyHighlightClaimed: boolean;
  highlightStyle: HighlightStyle;
  theme: 'light' | 'dark';
}

export interface StatementDocument {
  id: string;
  fileName: string;
  fileSize: number;
  uploadedAt: string;
  pageCount: number;
  invoiceRef: string;
  accountNumber: string;
  periodStart: string | null;
  periodEnd: string | null;
  transactionCount: number;
  excludedLineCount: number;
}

export type AuditEventType =
  | 'import'
  | 'analysis'
  | 'override'
  | 'note'
  | 'bulk'
  | 'settings'
  | 'export'
  | 'reset'
  | 'delete';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  type: AuditEventType;
  message: string;
  details?: string;
}

export interface LearnedCommuteHabits {
  commonWorkDays: { weekday: number; label: string; count: number }[];
  topRoads: { road: string; count: number; spend: number }[];
  topTollPoints: { tollPoint: string; count: number }[];
  avgMorningDeparture: string | null;
  avgEveningReturn: string | null;
  pairingRate: number; // 0..1
  tripDays: number;
  pairedDays: number;
}

export type ViewKey = 'dashboard' | 'transactions' | 'split' | 'calendar';
