export type BookFormat = "TXT" | "EPUB" | "PDF";
export type ReaderFlow = "paginated" | "scrolled";
export type ReaderSpread = "single" | "double";
export type AnnotationStyle = "highlight" | "underline" | "bookmark";

export type ReaderSettings = {
  fontFamily: "system" | "lxgw" | "serif" | "sans";
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  verticalMargin: number;
  horizontalMargin: number;
  pageColor: string;
  paperTexture: "plain" | "paper" | "soft";
  flow: ReaderFlow;
  spread: ReaderSpread;
};

export const defaultReaderSettings: ReaderSettings = {
  fontFamily: "lxgw",
  fontSize: 19,
  lineHeight: 1.9,
  paragraphSpacing: 14,
  verticalMargin: 5,
  horizontalMargin: 7,
  pageColor: "#eee8dc",
  paperTexture: "paper",
  flow: "paginated",
  spread: "single",
};

export type TocItem = {
  id: string;
  label: string;
  level: number;
  locator: string;
  page?: number;
  active?: boolean;
};

export type ReaderLocation = {
  locator: string;
  progress: number;
  page: number;
  totalPages: number;
  chapterTitle: string;
  chapterIndex: number;
  chapterCount: number;
};

export type ReaderSelection = {
  quote: string;
  locator: string;
  rect?: { x: number; y: number; width: number; height: number };
};

export type ReaderSearchResult = {
  id: string;
  label: string;
  excerpt: string;
  locator: string;
  page?: number;
};

export type ReaderAnnotation = {
  id: string;
  bookId: string;
  style: AnnotationStyle;
  quote: string;
  note: string;
  locator: string;
  color: string;
  chapterTitle: string;
  progress: number;
  createdAt: number;
  updatedAt: number;
};

export type ReaderApi = {
  next: () => void;
  prev: () => void;
  goTo: (locator: string) => void;
  search: (query: string) => Promise<ReaderSearchResult[]>;
};

export type AppPreferences = {
  appTheme: "light" | "dark" | "system";
  density: "comfortable" | "compact";
  startPage: "library" | "last-read";
  autoSync: boolean;
  profileName: string;
  avatarDataUrl: string;
};

export const defaultAppPreferences: AppPreferences = {
  appTheme: "light",
  density: "comfortable",
  startPage: "library",
  autoSync: true,
  profileName: "嘉洛",
  avatarDataUrl: "",
};
