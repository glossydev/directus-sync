// Shared types for export/import functionality

export interface TreeNode {
  id: string;
  name: string;
  type: 'category' | 'item';
  category?: 'data-model' | 'flows' | 'roles' | 'policies';
  checked: boolean;
  expanded?: boolean;
  children?: TreeNode[];
  data?: any;
  // For import diff status
  status?: 'new' | 'unchanged' | 'modified' | 'missing';
  diff?: string[];
}

export interface ExportManifest {
  version: string;
  exportedAt: string;
  directusVersion?: string;
  contents: {
    collections: CollectionExport[];
    flows: FlowExport[];
    roles: RoleExport[];
    policies: PolicyExport[];
  };
}

export interface CollectionExport {
  collection: string;
  meta: any;
  schema: any;
  fields: FieldExport[];
}

export interface FieldExport {
  field: string;
  type: string;
  meta: any;
  schema: any;
}

export interface FlowExport {
  id: string;
  name: string;
  icon: string;
  color: string | null;
  description: string | null;
  status: string;
  trigger: string;
  accountability: string | null;
  options: any;
  operations: OperationExport[];
}

export interface OperationExport {
  id: string;
  name: string;
  key: string;
  type: string;
  position_x: number;
  position_y: number;
  options: any;
  resolve: string | null;
  reject: string | null;
}

export interface RoleExport {
  id: string;
  name: string;
  icon: string;
  description: string | null;
  parent: string | null;
  children?: RoleExport[];
}

export interface PolicyExport {
  id: string;
  name: string;
  icon: string | null;
  description: string | null;
  ip_access: string | null;
  enforce_tfa: boolean;
  admin_access: boolean;
  app_access: boolean;
  permissions: PermissionExport[];
  roles: string[]; // Role IDs this policy is attached to
}

export interface PermissionExport {
  id?: string;
  collection: string;
  action: string;
  permissions: any;
  validation: any;
  presets: any;
  fields: string[] | null;
}

export interface ImportComparisonResult {
  tree: TreeNode[];
  summary: {
    new: number;
    unchanged: number;
    modified: number;
  };
}

// Remote sync types
export interface RemoteConnection {
  url: string;
  token: string;
}

export interface RemoteComparisonResult {
  local: TreeNode[];
  remote: TreeNode[];
  summary: {
    localOnly: number;
    remoteOnly: number;
    matching: number;
    different: number;
  };
}

export interface SyncItem {
  id: string;
  name: string;
  type: 'collection' | 'flow' | 'role' | 'policy';
  localStatus: 'exists' | 'missing';
  remoteStatus: 'exists' | 'missing';
  comparison: 'identical' | 'different' | 'local-only' | 'remote-only';
  diff?: string[];
  localData?: any;
  remoteData?: any;
}
