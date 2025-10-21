// types/modal.ts
import { Document, Company, UploadFile } from "./documents";

export interface UploadModalProps {
  selectedCompany: Company;
  selectedDocument: Document;
  onUpload: (files: UploadFile[]) => Promise<void>;
  onClose: () => void;
  isUploading: boolean;
}

export interface SettingsModalProps {
  documents: Document[];
  visibleColumns: Record<
    string,
    {
      visible: boolean;
      subColumns: {
        upload: boolean;
        issueDate: boolean;
        expiryDate: boolean;
        daysLeft: boolean;
        status: boolean;
      };
    }
  >;
  setVisibleColumns: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  setShowSettingsModal: (show: boolean) => void;
}

export interface DocumentViewerProps {
  documents: Array<{
    id: string;
    url: string;
    uploadDate: Date;
    issueDate?: string;
    expiryDate?: string;
    documentType?: string;
  }>;
  companyName: string;
  documentName: string;
  onClose: () => void;
  onUpdateDocumentType: (
    docId: string,
    type: "recent" | "past"
  ) => Promise<void>;
  onDelete: (docId: string, filePath: string) => Promise<void>;
  onUpdateDates: (
    docId: string,
    updates: { issue_date?: string | null; expiry_date?: string | null }
  ) => Promise<void>;
}

export interface MissingDocumentsModalProps {
  missingDocuments: Document[];
  companyName: string;
  onClose: () => void;
  onUpload: (
    uploads: Array<{
      doc: Document;
      file: File;
      issueDate?: string;
      expiryDate?: string;
    }>
  ) => Promise<void>;
}
