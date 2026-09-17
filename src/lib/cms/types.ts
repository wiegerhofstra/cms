export type TenantRole = "owner" | "editor";
export type AppRole = "admin" | "user";
export type ModelStatus = "active" | "archived";
export type EntryStatus = "draft" | "published";
export type FieldType = "text" | "rich_text" | "url" | "number" | "boolean" | "date" | "enum" | "asset" | "component" | "slug";
export type AssetStatus = "pending" | "ready" | "deleted";

export type CmsUser = {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  image?: string | null;
};

export type TenantMembership = {
  tenantId: string;
  role: TenantRole;
  tenant: {
    id: string;
    slug: string;
    name: string;
  };
};

export type ManagedUserMembership = TenantMembership;

export type ManagedUser = CmsUser & {
  emailVerified: boolean;
  banned: boolean;
  banReason: string | null;
  banExpires: string | null;
  createdAt: string;
  updatedAt: string;
  memberships: ManagedUserMembership[];
};

export type TenantSummary = {
  id: string;
  slug: string;
  name: string;
};

export type AccessTokenSummary = {
  id: string;
  name: string;
  tokenHint: string;
  tenant: TenantSummary;
  createdBy: { id: string; name: string } | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CmsSessionView = {
  user: CmsUser;
  activeTenantId: string | null;
  memberships: TenantMembership[];
};

export type ContentModel = {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  status: ModelStatus;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ContentField = {
  id: string;
  tenantId: string;
  modelId: string;
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  position: number;
  config: Record<string, unknown>;
  targetModels: Array<Pick<ContentModel, "id" | "name" | "slug">>;
  isList: boolean;
  isTitle: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ContentEntry = {
  id: string;
  tenantId: string;
  modelId: string;
  status: EntryStatus;
  data: Record<string, unknown>;
  publishedAt: string | null;
  deletedAt: string | null;
  parentEntryId: string | null;
  parentFieldId: string | null;
  position: number | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EntryRevision = {
  id: string;
  tenantId: string;
  entryId: string;
  version: number;
  data: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
};

export type Asset = {
  id: string;
  tenantId: string;
  uploadedBy: string | null;
  bucket: string;
  objectKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  imageWidth: number | null;
  imageHeight: number | null;
  etag: string | null;
  status: AssetStatus;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AssetWithPreview = Asset & {
  previewUrl: string | null;
  downloadUrl: string | null;
};

export type FieldInput = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  config?: Record<string, unknown>;
  isTitle?: boolean;
};

export type WorkbenchView =
  | "dashboard"
  | "tenant-settings"
  | "users"
  | "auth"
  | "models"
  | "model-new"
  | "model-detail"
  | "entries"
  | "model-entries"
  | "entry-new"
  | "entry-detail"
  | "assets"
  | "asset-new"
  | "asset-detail";

export type ComponentReferenceList = {
  fieldId: string;
  modelId: string;
  modelName: string;
  entries: ContentEntry[];
  titleField: ContentField | null;
};

export type AssetSort = "date-desc" | "date-asc" | "name-asc" | "name-desc" | "type-asc" | "size-desc";

export type WorkbenchData = {
  me: CmsSessionView;
  models: ContentModel[];
  fields: ContentField[];
  entries: ContentEntry[];
  componentReferences: ComponentReferenceList[];
  entry: ContentEntry | null;
  revisions: EntryRevision[];
  assets: AssetWithPreview[];
  assetQuery: string;
  assetSort: AssetSort;
  assetPage: number;
  assetPageSize: number;
  assetTotal: number;
  users: ManagedUser[];
  accessTokens: AccessTokenSummary[];
  tenants: TenantSummary[];
  activeModelId: string;
  activeEntryId: string;
  entryQuery: string;
};

export type LoadWorkbenchDataInput = {
  tenantSlug?: string;
  view?: WorkbenchView;
  modelId?: string;
  entryId?: string;
  query?: string;
  assetQuery?: string;
  assetSort?: AssetSort;
  assetPage?: number;
  preferredModelId?: string;
};
