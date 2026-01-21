<template>
  <private-view title="Directus Sync">
    <template #headline>
      <v-breadcrumb :items="[{ name: 'Sync', to: '/sync' }]" />
    </template>

    <template #title-outer:prepend>
      <v-button class="header-icon" rounded disabled icon secondary>
        <v-icon name="sync" />
      </v-button>
    </template>

    <template #actions>
      <v-button @click="openExportDialog" :disabled="loading">
        <v-icon name="download" left />
        Export
      </v-button>
      <v-button @click="openImportDialog" :disabled="loading" secondary>
        <v-icon name="upload" left />
        Import
      </v-button>
    </template>

    <div class="sync-container">
      <div class="sync-header">
        <h1 class="sync-title">Directus Sync</h1>
        <p class="sync-description">
          Export and import data models, flows, user roles, and access policies between Directus instances.
        </p>
      </div>

      <div class="sync-cards">
        <div class="sync-card" @click="openExportDialog">
          <v-icon name="download" x-large />
          <h3>Export Configuration</h3>
          <p>Select and export your data models, flows, roles, and policies to a JSON file.</p>
        </div>

        <div class="sync-card" @click="openImportDialog">
          <v-icon name="upload" x-large />
          <h3>Import Configuration</h3>
          <p>Import a configuration file and review changes before applying them.</p>
        </div>

        <div class="sync-card" @click="openRemoteDialog">
          <v-icon name="cloud_sync" x-large />
          <h3>Remote Sync</h3>
          <p>Connect to a remote Directus instance and push or pull configurations.</p>
        </div>
      </div>

      <!-- Last export download link -->
      <div v-if="exportedManifest" class="last-export">
        <v-icon name="check_circle" small class="last-export-icon" />
        <span>Last export ready:</span>
        <a href="#" @click.prevent="downloadExport" class="download-link">
          Download {{ lastExportFileName }}
        </a>
      </div>
    </div>

    <!-- Export Dialog -->
    <v-dialog v-model="showExportDialog" @esc="closeExportDialog">
      <v-card class="dialog-card">
        <v-card-title>Export Configuration</v-card-title>
        <v-card-text>
          <p class="dialog-description">Select the items you want to export:</p>

          <div v-if="loadingTree" class="loading-state">
            <v-progress-circular indeterminate />
            <span>Loading available items...</span>
          </div>

          <tree-select
            v-else-if="exportTree.length > 0"
            v-model="exportTree"
          />

          <div v-else class="empty-state">
            <v-icon name="info" />
            <span>No items available to export.</span>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-button secondary @click="closeExportDialog">Cancel</v-button>
          <v-button @click="performExport" :disabled="!hasSelectedItems || exporting">
            <v-progress-circular v-if="exporting" indeterminate small />
            <span v-else>Export Selected</span>
          </v-button>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Export Progress Dialog -->
    <v-dialog v-model="showExportProgress" persistent>
      <v-card class="dialog-card">
        <v-card-title>Preparing Export</v-card-title>
        <v-card-text>
          <div class="progress-state">
            <v-progress-circular indeterminate />
            <span>{{ exportProgressMessage }}</span>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>

    <!-- Export Complete Dialog -->
    <v-dialog v-model="showExportComplete">
      <v-card class="dialog-card">
        <v-card-title>Export Complete</v-card-title>
        <v-card-text>
          <div class="success-state">
            <v-icon name="check_circle" x-large class="success-icon" />
            <p>Your export is ready for download.</p>
            <div class="export-summary">
              <div v-if="exportSummary.collections > 0">{{ exportSummary.collections }} collection(s)</div>
              <div v-if="exportSummary.flows > 0">{{ exportSummary.flows }} flow(s)</div>
              <div v-if="exportSummary.roles > 0">{{ exportSummary.roles }} role(s)</div>
              <div v-if="exportSummary.policies > 0">{{ exportSummary.policies }} policy/policies</div>
            </div>
            <div class="download-actions">
              <a
                :href="exportDataUrl"
                :download="lastExportFileName"
                class="download-button"
                @click="downloadStarted = true"
              >
                <v-icon name="download" small />
                Download File
              </a>
            </div>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-button @click="closeExportComplete">
            {{ downloadStarted ? 'Done' : 'Close' }}
          </v-button>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Import Dialog - File Selection -->
    <v-dialog v-model="showImportDialog" @esc="closeImportDialog">
      <v-card class="dialog-card">
        <v-card-title>Import Configuration</v-card-title>
        <v-card-text>
          <p class="dialog-description">Select a configuration file to import:</p>

          <div class="file-input-wrapper">
            <input
              type="file"
              ref="fileInput"
              accept=".json"
              @change="handleFileSelect"
              class="file-input"
            />
            <v-button @click="triggerFileInput" secondary :disabled="parsingFile">
              <v-icon name="folder_open" left />
              {{ selectedFileName || 'Choose File' }}
            </v-button>
          </div>

          <div v-if="parsingFile" class="loading-state">
            <v-progress-circular indeterminate />
            <span>Parsing file...</span>
          </div>

          <div v-if="fileError" class="error-state">
            <v-icon name="error" />
            <span>{{ fileError }}</span>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-button secondary @click="closeImportDialog">Cancel</v-button>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Import Review Dialog -->
    <v-dialog v-model="showImportReview" @esc="closeImportReview">
      <v-card class="dialog-card dialog-card-large">
        <v-card-title>Review Import</v-card-title>
        <v-card-text>
          <div class="import-summary">
            <div class="summary-item summary-new">
              <span class="summary-count">{{ importSummary.new }}</span>
              <span class="summary-label">New</span>
            </div>
            <div class="summary-item summary-modified">
              <span class="summary-count">{{ importSummary.modified }}</span>
              <span class="summary-label">Modified</span>
            </div>
            <div class="summary-item summary-unchanged">
              <span class="summary-count">{{ importSummary.unchanged }}</span>
              <span class="summary-label">Unchanged</span>
            </div>
          </div>

          <p class="dialog-description">Select the items you want to import:</p>

          <tree-select v-model="importTree" />
        </v-card-text>
        <v-card-actions>
          <v-button secondary @click="closeImportReview">Cancel</v-button>
          <v-button @click="performImport" :disabled="!hasSelectedImportItems || importing">
            <v-progress-circular v-if="importing" indeterminate small />
            <span v-else>Import Selected</span>
          </v-button>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Import Progress Dialog -->
    <v-dialog v-model="showImportProgress" persistent>
      <v-card class="dialog-card">
        <v-card-title>Importing</v-card-title>
        <v-card-text>
          <div class="progress-state">
            <v-progress-circular indeterminate />
            <span>{{ importProgressMessage }}</span>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>

    <!-- Import Complete Dialog -->
    <v-dialog v-model="showImportComplete">
      <v-card class="dialog-card">
        <v-card-title>Import Complete</v-card-title>
        <v-card-text>
          <div class="success-state">
            <v-icon name="check_circle" x-large class="success-icon" />
            <p>Import completed successfully.</p>
            <div class="import-results">
              <div v-if="importResults.collections.created > 0 || importResults.collections.updated > 0">
                Collections: {{ importResults.collections.created }} created, {{ importResults.collections.updated }} updated
              </div>
              <div v-if="importResults.flows.created > 0 || importResults.flows.updated > 0">
                Flows: {{ importResults.flows.created }} created, {{ importResults.flows.updated }} updated
              </div>
              <div v-if="importResults.roles.created > 0 || importResults.roles.updated > 0">
                Roles: {{ importResults.roles.created }} created, {{ importResults.roles.updated }} updated
              </div>
              <div v-if="importResults.policies.created > 0 || importResults.policies.updated > 0">
                Policies: {{ importResults.policies.created }} created, {{ importResults.policies.updated }} updated
              </div>
            </div>

            <!-- Show errors if any -->
            <div v-if="hasImportErrors" class="import-errors">
              <h4>Errors:</h4>
              <div v-for="(errors, category) in importResultErrors" :key="category">
                <div v-for="error in errors" :key="error" class="error-item">{{ error }}</div>
              </div>
            </div>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-button @click="showImportComplete = false">Close</v-button>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Error Dialog -->
    <v-dialog v-model="showError">
      <v-card class="dialog-card">
        <v-card-title>Error</v-card-title>
        <v-card-text>
          <div class="error-state">
            <v-icon name="error" x-large class="error-icon" />
            <p>{{ errorMessage }}</p>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-button @click="showError = false">Close</v-button>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Remote Connection Dialog -->
    <v-dialog v-model="showRemoteDialog" @esc="closeRemoteDialog">
      <v-card class="dialog-card">
        <v-card-title>Connect to Remote Instance</v-card-title>
        <v-card-text>
          <!-- Saved connections -->
          <div v-if="savedConnections.length > 0" class="saved-connections">
            <label>Saved Connections</label>
            <div class="connections-list">
              <div
                v-for="conn in savedConnections"
                :key="conn.id"
                class="connection-item"
                :class="{ 'connection-selected': selectedConnectionId === conn.id }"
                @click="selectSavedConnection(conn)"
              >
                <div class="connection-info">
                  <span class="connection-name">{{ conn.name }}</span>
                  <span class="connection-url">{{ conn.url }}</span>
                </div>
                <v-icon
                  name="delete"
                  small
                  clickable
                  class="delete-connection"
                  @click.stop="deleteSavedConnection(conn.id)"
                />
              </div>
            </div>
          </div>

          <p class="dialog-description">{{ savedConnections.length > 0 ? 'Or enter new connection details:' : 'Enter the URL and admin access token of the remote Directus instance:' }}</p>

          <div class="form-field">
            <label>Connection Name (optional)</label>
            <v-input
              v-model="connectionName"
              placeholder="My Production Server"
              :disabled="connectingRemote"
            />
          </div>

          <div class="form-field">
            <label>Remote URL</label>
            <v-input
              v-model="remoteUrl"
              placeholder="https://your-directus-instance.com"
              :disabled="connectingRemote"
            />
          </div>

          <div class="form-field">
            <label>Access Token</label>
            <v-input
              v-model="remoteToken"
              type="password"
              placeholder="Admin access token"
              :disabled="connectingRemote"
            />
          </div>

          <div class="save-connection-option">
            <v-checkbox v-model="saveConnection" :disabled="connectingRemote" />
            <span>Save this connection for future use</span>
          </div>

          <div v-if="remoteError" class="error-state">
            <v-icon name="error" small />
            <span>{{ remoteError }}</span>
          </div>

          <div v-if="remoteConnected" class="success-state-inline">
            <v-icon name="check_circle" small />
            <span>Connected successfully</span>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-button secondary @click="closeRemoteDialog">Cancel</v-button>
          <v-button @click="testRemoteConnection" :disabled="!remoteUrl || !remoteToken || connectingRemote">
            <v-progress-circular v-if="connectingRemote" indeterminate small />
            <span v-else>{{ remoteConnected ? 'Scan Changes' : 'Connect' }}</span>
          </v-button>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Remote Comparison Dialog -->
    <v-dialog v-model="showRemoteComparison" @esc="closeRemoteComparison">
      <v-card class="dialog-card dialog-card-large">
        <v-card-title>Remote Sync: {{ remoteUrl }}</v-card-title>
        <v-card-text>
          <div class="remote-summary">
            <div class="summary-item summary-local-only">
              <span class="summary-count">{{ remoteSummary.localOnly }}</span>
              <span class="summary-label">Local Only</span>
            </div>
            <div class="summary-item summary-remote-only">
              <span class="summary-count">{{ remoteSummary.remoteOnly }}</span>
              <span class="summary-label">Remote Only</span>
            </div>
            <div class="summary-item summary-different">
              <span class="summary-count">{{ remoteSummary.different }}</span>
              <span class="summary-label">Different</span>
            </div>
            <div class="summary-item summary-matching">
              <span class="summary-count">{{ remoteSummary.matching }}</span>
              <span class="summary-label">Matching</span>
            </div>
          </div>

          <p class="dialog-description">Select items to sync:</p>

          <div class="remote-items-list">
            <div v-for="category in remoteCategories" :key="category.name" class="remote-category">
              <div class="category-header">
                <v-icon
                  :name="category.expanded ? 'expand_more' : 'chevron_right'"
                  clickable
                  @click="toggleCategoryExpand(category.name)"
                />
                <v-checkbox
                  :model-value="isCategoryFullySelected(category.name)"
                  :indeterminate="isCategoryPartiallySelected(category.name)"
                  @update:model-value="toggleCategorySelection(category.name)"
                  @click.stop
                />
                <span class="category-name" @click="toggleCategoryExpand(category.name)">{{ category.label }}</span>
                <span class="category-count">({{ getCategorySelectedCount(category.name) }}/{{ category.items.length }})</span>
              </div>

              <div v-if="category.expanded" class="category-items">
                <div
                  v-for="item in category.items"
                  :key="item.id"
                  class="remote-item"
                  :class="{ 'item-selected': selectedRemoteItems.has(item.id) }"
                  @click="toggleRemoteItem(item.id)"
                >
                  <v-checkbox
                    :model-value="selectedRemoteItems.has(item.id)"
                    @update:model-value="toggleRemoteItem(item.id)"
                  />
                  <span class="item-name">{{ item.name }}</span>
                  <span :class="['comparison-badge', `comparison-${item.comparison}`]">
                    {{ formatComparison(item.comparison) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-button secondary @click="closeRemoteComparison">Cancel</v-button>
          <v-button
            secondary
            @click="pullFromRemote"
            :disabled="selectedRemoteItems.size === 0 || syncing"
          >
            <v-icon name="cloud_download" left />
            Pull Selected
          </v-button>
          <v-button
            @click="pushToRemote"
            :disabled="selectedRemoteItems.size === 0 || syncing"
          >
            <v-icon name="cloud_upload" left />
            Push Selected
          </v-button>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Remote Sync Progress Dialog -->
    <v-dialog v-model="showRemoteSyncProgress" persistent>
      <v-card class="dialog-card">
        <v-card-title>{{ syncDirection === 'push' ? 'Pushing' : 'Pulling' }} Changes</v-card-title>
        <v-card-text>
          <div class="progress-state">
            <v-progress-circular indeterminate />
            <span>{{ remoteSyncMessage }}</span>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>

    <!-- Remote Sync Complete Dialog -->
    <v-dialog v-model="showRemoteSyncComplete">
      <v-card class="dialog-card">
        <v-card-title>{{ syncDirection === 'push' ? 'Push' : 'Pull' }} Complete</v-card-title>
        <v-card-text>
          <div class="success-state">
            <v-icon name="check_circle" x-large class="success-icon" />
            <p>Sync completed successfully.</p>
            <div class="sync-results">
              <div v-if="remoteSyncResults.collections.pushed > 0 || remoteSyncResults.collections.pulled > 0">
                Collections: {{ remoteSyncResults.collections.pushed || remoteSyncResults.collections.pulled }} {{ syncDirection === 'push' ? 'pushed' : 'pulled' }}
              </div>
              <div v-if="remoteSyncResults.flows.pushed > 0 || remoteSyncResults.flows.pulled > 0">
                Flows: {{ remoteSyncResults.flows.pushed || remoteSyncResults.flows.pulled }} {{ syncDirection === 'push' ? 'pushed' : 'pulled' }}
              </div>
              <div v-if="remoteSyncResults.roles.pushed > 0 || remoteSyncResults.roles.pulled > 0">
                Roles: {{ remoteSyncResults.roles.pushed || remoteSyncResults.roles.pulled }} {{ syncDirection === 'push' ? 'pushed' : 'pulled' }}
              </div>
              <div v-if="remoteSyncResults.policies.pushed > 0 || remoteSyncResults.policies.pulled > 0">
                Policies: {{ remoteSyncResults.policies.pushed || remoteSyncResults.policies.pulled }} {{ syncDirection === 'push' ? 'pushed' : 'pulled' }}
              </div>
            </div>

            <div v-if="hasRemoteSyncErrors" class="import-errors">
              <h4>Errors:</h4>
              <div v-for="(errors, category) in remoteSyncErrors" :key="category">
                <div v-for="error in errors" :key="error" class="error-item">{{ error }}</div>
              </div>
            </div>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-button @click="showRemoteSyncComplete = false">Close</v-button>
          <v-button secondary @click="rescanRemote">Rescan</v-button>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </private-view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useApi } from '@directus/extensions-sdk';
import TreeSelect from '../components/TreeSelect.vue';
import type { TreeNode, ExportManifest } from '../types';

const api = useApi();

// General state
const loading = ref(false);

// Export state
const showExportDialog = ref(false);
const showExportProgress = ref(false);
const showExportComplete = ref(false);
const downloadStarted = ref(false);
const loadingTree = ref(false);
const exporting = ref(false);
const exportTree = ref<TreeNode[]>([]);
const exportProgressMessage = ref('Preparing export...');
const exportedManifest = ref<ExportManifest | null>(null);

const exportSummary = computed(() => ({
  collections: exportedManifest.value?.contents.collections.length ?? 0,
  flows: exportedManifest.value?.contents.flows.length ?? 0,
  roles: exportedManifest.value?.contents.roles.length ?? 0,
  policies: exportedManifest.value?.contents.policies.length ?? 0,
}));

const exportDataUrl = computed(() => {
  if (!exportedManifest.value) return '';
  const dataStr = JSON.stringify(exportedManifest.value, null, 2);
  return 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
});

const hasSelectedItems = computed(() => {
  return exportTree.value.some((node) =>
    node.children?.some((child) => child.checked)
  );
});

const lastExportFileName = computed(() => {
  if (!exportedManifest.value) return '';
  return `directus-sync-${exportedManifest.value.exportedAt.split('T')[0]}.json`;
});

// Error state
const showError = ref(false);
const errorMessage = ref('');

// Import state
const showImportDialog = ref(false);
const showImportReview = ref(false);
const showImportProgress = ref(false);
const showImportComplete = ref(false);
const parsingFile = ref(false);
const importing = ref(false);
const selectedFileName = ref('');
const fileError = ref('');
const fileInput = ref<HTMLInputElement | null>(null);
const importManifest = ref<ExportManifest | null>(null);
const importTree = ref<TreeNode[]>([]);
const importProgressMessage = ref('Importing...');
const importSummary = ref({ new: 0, modified: 0, unchanged: 0 });
const importResults = ref({
  collections: { created: 0, updated: 0, errors: [] as string[] },
  flows: { created: 0, updated: 0, errors: [] as string[] },
  roles: { created: 0, updated: 0, errors: [] as string[] },
  policies: { created: 0, updated: 0, errors: [] as string[] },
});

const hasSelectedImportItems = computed(() => {
  return importTree.value.some((node) =>
    node.children?.some((child) => child.checked)
  );
});

const hasImportErrors = computed(() => {
  return (
    importResults.value.collections.errors.length > 0 ||
    importResults.value.flows.errors.length > 0 ||
    importResults.value.roles.errors.length > 0 ||
    importResults.value.policies.errors.length > 0
  );
});

const importResultErrors = computed(() => {
  const errors: Record<string, string[]> = {};
  if (importResults.value.collections.errors.length > 0) {
    errors.collections = importResults.value.collections.errors;
  }
  if (importResults.value.flows.errors.length > 0) {
    errors.flows = importResults.value.flows.errors;
  }
  if (importResults.value.roles.errors.length > 0) {
    errors.roles = importResults.value.roles.errors;
  }
  if (importResults.value.policies.errors.length > 0) {
    errors.policies = importResults.value.policies.errors;
  }
  return errors;
});

// Remote sync state
const showRemoteDialog = ref(false);
const showRemoteComparison = ref(false);
const showRemoteSyncProgress = ref(false);
const showRemoteSyncComplete = ref(false);
const remoteUrl = ref('');
const remoteToken = ref('');
const remoteError = ref('');
const remoteConnected = ref(false);
const connectingRemote = ref(false);
const syncing = ref(false);
const syncDirection = ref<'push' | 'pull'>('push');
const remoteSyncMessage = ref('');
const selectedRemoteItems = ref(new Set<string>());
const remoteComparison = ref<any>(null);
const remoteSummary = ref({ localOnly: 0, remoteOnly: 0, matching: 0, different: 0 });
const remoteSyncResults = ref({
  collections: { pushed: 0, pulled: 0, errors: [] as string[] },
  flows: { pushed: 0, pulled: 0, errors: [] as string[] },
  roles: { pushed: 0, pulled: 0, errors: [] as string[] },
  policies: { pushed: 0, pulled: 0, errors: [] as string[] },
});

// Saved connections state
interface SavedConnection {
  id: string;
  name: string;
  url: string;
  token: string;
}
const savedConnections = ref<SavedConnection[]>([]);
const connectionName = ref('');
const saveConnection = ref(false);
const selectedConnectionId = ref<string | null>(null);

// Category expansion state (reactive)
const categoryExpanded = ref<Record<string, boolean>>({
  collections: true,
  flows: true,
  roles: true,
  policies: true,
});

// Load saved connections from localStorage
function loadSavedConnections() {
  try {
    const stored = localStorage.getItem('directus-sync-connections');
    if (stored) {
      savedConnections.value = JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load saved connections:', e);
  }
}

function saveSavedConnections() {
  try {
    localStorage.setItem('directus-sync-connections', JSON.stringify(savedConnections.value));
  } catch (e) {
    console.error('Failed to save connections:', e);
  }
}

function selectSavedConnection(conn: SavedConnection) {
  selectedConnectionId.value = conn.id;
  connectionName.value = conn.name;
  remoteUrl.value = conn.url;
  remoteToken.value = conn.token;
  saveConnection.value = false;
  remoteConnected.value = false;
  remoteError.value = '';
}

function deleteSavedConnection(id: string) {
  savedConnections.value = savedConnections.value.filter(c => c.id !== id);
  saveSavedConnections();
  if (selectedConnectionId.value === id) {
    selectedConnectionId.value = null;
  }
}

// Load connections on init
loadSavedConnections();

interface RemoteCategory {
  name: string;
  label: string;
  expanded: boolean;
  items: any[];
}

const remoteCategories = computed<RemoteCategory[]>(() => {
  if (!remoteComparison.value) return [];
  return [
    { name: 'collections', label: 'Data Model', expanded: categoryExpanded.value.collections, items: remoteComparison.value.collections || [] },
    { name: 'flows', label: 'Flows', expanded: categoryExpanded.value.flows, items: remoteComparison.value.flows || [] },
    { name: 'roles', label: 'User Roles', expanded: categoryExpanded.value.roles, items: remoteComparison.value.roles || [] },
    { name: 'policies', label: 'Access Policies', expanded: categoryExpanded.value.policies, items: remoteComparison.value.policies || [] },
  ];
});

// Category selection helpers
function toggleCategoryExpand(categoryName: string) {
  categoryExpanded.value[categoryName] = !categoryExpanded.value[categoryName];
}

function getCategoryItems(categoryName: string): any[] {
  if (!remoteComparison.value) return [];
  return remoteComparison.value[categoryName] || [];
}

function isCategoryFullySelected(categoryName: string): boolean {
  const items = getCategoryItems(categoryName);
  if (items.length === 0) return false;
  return items.every(item => selectedRemoteItems.value.has(item.id));
}

function isCategoryPartiallySelected(categoryName: string): boolean {
  const items = getCategoryItems(categoryName);
  if (items.length === 0) return false;
  const selectedCount = items.filter(item => selectedRemoteItems.value.has(item.id)).length;
  return selectedCount > 0 && selectedCount < items.length;
}

function getCategorySelectedCount(categoryName: string): number {
  const items = getCategoryItems(categoryName);
  return items.filter(item => selectedRemoteItems.value.has(item.id)).length;
}

function toggleCategorySelection(categoryName: string) {
  const items = getCategoryItems(categoryName);
  const allSelected = isCategoryFullySelected(categoryName);

  if (allSelected) {
    // Deselect all items in this category
    for (const item of items) {
      selectedRemoteItems.value.delete(item.id);
    }
  } else {
    // Select all items in this category
    for (const item of items) {
      selectedRemoteItems.value.add(item.id);
    }
  }
  // Force reactivity
  selectedRemoteItems.value = new Set(selectedRemoteItems.value);
}

const hasRemoteSyncErrors = computed(() => {
  return (
    remoteSyncResults.value.collections.errors.length > 0 ||
    remoteSyncResults.value.flows.errors.length > 0 ||
    remoteSyncResults.value.roles.errors.length > 0 ||
    remoteSyncResults.value.policies.errors.length > 0
  );
});

const remoteSyncErrors = computed(() => {
  const errors: Record<string, string[]> = {};
  if (remoteSyncResults.value.collections.errors.length > 0) {
    errors.collections = remoteSyncResults.value.collections.errors;
  }
  if (remoteSyncResults.value.flows.errors.length > 0) {
    errors.flows = remoteSyncResults.value.flows.errors;
  }
  if (remoteSyncResults.value.roles.errors.length > 0) {
    errors.roles = remoteSyncResults.value.roles.errors;
  }
  if (remoteSyncResults.value.policies.errors.length > 0) {
    errors.policies = remoteSyncResults.value.policies.errors;
  }
  return errors;
});

// Export functions
async function openExportDialog() {
  showExportDialog.value = true;
  loadingTree.value = true;

  try {
    const response = await api.get('/sync-api/tree');
    exportTree.value = response.data.tree;
  } catch (error: any) {
    console.error('Failed to load export tree:', error);
  } finally {
    loadingTree.value = false;
  }
}

function closeExportDialog() {
  showExportDialog.value = false;
  exportTree.value = [];
}

function getSelectedIds(tree: TreeNode[]): string[] {
  const ids: string[] = [];
  for (const node of tree) {
    if (node.children) {
      for (const child of node.children) {
        if (child.checked) {
          ids.push(child.id);
        }
      }
    }
  }
  return ids;
}

async function performExport() {
  const selectedIds = getSelectedIds(exportTree.value);
  if (selectedIds.length === 0) return;

  showExportDialog.value = false;
  showExportProgress.value = true;
  exporting.value = true;
  exportProgressMessage.value = 'Gathering selected items...';

  try {
    exportProgressMessage.value = 'Building export file...';
    const response = await api.post('/sync-api/export', { selectedIds });

    if (response.data.error) {
      throw new Error(response.data.error);
    }

    exportedManifest.value = response.data.manifest;
    downloadStarted.value = false;

    showExportProgress.value = false;
    showExportComplete.value = true;
  } catch (error: any) {
    console.error('Export failed:', error);
    showExportProgress.value = false;
    errorMessage.value = error.response?.data?.error || error.message || 'Export failed';
    showError.value = true;
  } finally {
    exporting.value = false;
  }
}

function downloadExport() {
  if (!exportedManifest.value) return;

  const dataStr = JSON.stringify(exportedManifest.value, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `directus-sync-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function closeExportComplete() {
  showExportComplete.value = false;
  downloadStarted.value = false;
}

// Import functions
function openImportDialog() {
  showImportDialog.value = true;
  selectedFileName.value = '';
  fileError.value = '';
  importManifest.value = null;
}

function closeImportDialog() {
  showImportDialog.value = false;
  selectedFileName.value = '';
  fileError.value = '';
}

function closeImportReview() {
  showImportReview.value = false;
  importTree.value = [];
  importManifest.value = null;
}

function triggerFileInput() {
  fileInput.value?.click();
}

async function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];

  if (!file) return;

  selectedFileName.value = file.name;
  fileError.value = '';
  parsingFile.value = true;

  try {
    const text = await file.text();
    const manifest = JSON.parse(text) as ExportManifest;

    // Validate manifest structure
    if (!manifest.version || !manifest.contents) {
      throw new Error('Invalid manifest file format');
    }

    importManifest.value = manifest;

    // Compare with existing data
    const response = await api.post('/sync-api/compare', { manifest });
    importTree.value = response.data.tree;
    importSummary.value = response.data.summary;

    // Close file dialog and open review dialog
    showImportDialog.value = false;
    showImportReview.value = true;
  } catch (error: any) {
    fileError.value = error.message || 'Failed to parse file';
    console.error('File parse error:', error);
  } finally {
    parsingFile.value = false;
    // Reset file input
    if (fileInput.value) {
      fileInput.value.value = '';
    }
  }
}

async function performImport() {
  if (!importManifest.value) return;

  const selectedIds = getSelectedIds(importTree.value);
  if (selectedIds.length === 0) return;

  showImportReview.value = false;
  showImportProgress.value = true;
  importing.value = true;
  importProgressMessage.value = 'Importing selected items...';

  try {
    const response = await api.post('/sync-api/import', {
      manifest: importManifest.value,
      selectedIds,
    });

    importResults.value = response.data.results;

    showImportProgress.value = false;
    showImportComplete.value = true;
  } catch (error: any) {
    console.error('Import failed:', error);
    showImportProgress.value = false;
    // Could show error dialog here
  } finally {
    importing.value = false;
  }
}

// Remote sync functions
function openRemoteDialog() {
  showRemoteDialog.value = true;
  remoteError.value = '';
  remoteConnected.value = false;
  // Reset fields if no connection was selected
  if (!selectedConnectionId.value) {
    connectionName.value = '';
    remoteUrl.value = '';
    remoteToken.value = '';
  }
  saveConnection.value = false;
}

function closeRemoteDialog() {
  showRemoteDialog.value = false;
  remoteError.value = '';
  selectedConnectionId.value = null;
}

function closeRemoteComparison() {
  showRemoteComparison.value = false;
  remoteComparison.value = null;
  selectedRemoteItems.value.clear();
}

async function testRemoteConnection() {
  if (!remoteUrl.value || !remoteToken.value) return;

  connectingRemote.value = true;
  remoteError.value = '';

  try {
    // If already connected, scan for changes
    if (remoteConnected.value) {
      await scanRemote();
      return;
    }

    // Test connection
    const response = await api.post('/sync-api/remote/test', {
      url: remoteUrl.value,
      token: remoteToken.value,
    });

    if (response.data.success) {
      remoteConnected.value = true;

      // Save connection if requested
      if (saveConnection.value && !selectedConnectionId.value) {
        const newConnection: SavedConnection = {
          id: crypto.randomUUID(),
          name: connectionName.value || new URL(remoteUrl.value).hostname,
          url: remoteUrl.value,
          token: remoteToken.value,
        };
        savedConnections.value.push(newConnection);
        saveSavedConnections();
        selectedConnectionId.value = newConnection.id;
      }

      // Auto-scan after successful connection
      await scanRemote();
    }
  } catch (error: any) {
    remoteError.value = error.response?.data?.error || error.message || 'Connection failed';
    remoteConnected.value = false;
  } finally {
    connectingRemote.value = false;
  }
}

async function scanRemote() {
  connectingRemote.value = true;
  remoteError.value = '';

  try {
    const response = await api.post('/sync-api/remote/scan', {
      url: remoteUrl.value,
      token: remoteToken.value,
    });

    remoteComparison.value = response.data.comparison;
    remoteSummary.value = response.data.summary;

    // Pre-select items that are different or only on one side
    selectedRemoteItems.value.clear();
    for (const category of ['collections', 'flows', 'roles', 'policies']) {
      for (const item of response.data.comparison[category] || []) {
        if (item.comparison !== 'identical') {
          selectedRemoteItems.value.add(item.id);
        }
      }
    }

    showRemoteDialog.value = false;
    showRemoteComparison.value = true;
  } catch (error: any) {
    remoteError.value = error.response?.data?.error || error.message || 'Scan failed';
  } finally {
    connectingRemote.value = false;
  }
}

function toggleRemoteItem(id: string) {
  if (selectedRemoteItems.value.has(id)) {
    selectedRemoteItems.value.delete(id);
  } else {
    selectedRemoteItems.value.add(id);
  }
  // Force reactivity
  selectedRemoteItems.value = new Set(selectedRemoteItems.value);
}

function formatComparison(comparison: string): string {
  switch (comparison) {
    case 'local-only': return 'Local Only';
    case 'remote-only': return 'Remote Only';
    case 'identical': return 'Matching';
    case 'different': return 'Different';
    default: return comparison;
  }
}

async function pushToRemote() {
  if (selectedRemoteItems.value.size === 0) return;

  syncDirection.value = 'push';
  showRemoteComparison.value = false;
  showRemoteSyncProgress.value = true;
  syncing.value = true;
  remoteSyncMessage.value = 'Pushing selected items to remote...';

  try {
    const response = await api.post('/sync-api/remote/push', {
      url: remoteUrl.value,
      token: remoteToken.value,
      selectedIds: Array.from(selectedRemoteItems.value),
    });

    remoteSyncResults.value = response.data.results;
    showRemoteSyncProgress.value = false;
    showRemoteSyncComplete.value = true;
  } catch (error: any) {
    console.error('Push failed:', error);
    showRemoteSyncProgress.value = false;
    errorMessage.value = error.response?.data?.error || error.message || 'Push failed';
    showError.value = true;
  } finally {
    syncing.value = false;
  }
}

async function pullFromRemote() {
  if (selectedRemoteItems.value.size === 0) return;

  syncDirection.value = 'pull';
  showRemoteComparison.value = false;
  showRemoteSyncProgress.value = true;
  syncing.value = true;
  remoteSyncMessage.value = 'Pulling selected items from remote...';

  try {
    const response = await api.post('/sync-api/remote/pull', {
      url: remoteUrl.value,
      token: remoteToken.value,
      selectedIds: Array.from(selectedRemoteItems.value),
    });

    remoteSyncResults.value = response.data.results;
    showRemoteSyncProgress.value = false;
    showRemoteSyncComplete.value = true;
  } catch (error: any) {
    console.error('Pull failed:', error);
    showRemoteSyncProgress.value = false;
    errorMessage.value = error.response?.data?.error || error.message || 'Pull failed';
    showError.value = true;
  } finally {
    syncing.value = false;
  }
}

async function rescanRemote() {
  showRemoteSyncComplete.value = false;
  await scanRemote();
  showRemoteComparison.value = true;
}
</script>

<style scoped>
.sync-container {
  padding: var(--content-padding);
  padding-top: 0;
}

.sync-header {
  margin-bottom: 32px;
}

.sync-title {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 8px;
  color: var(--theme--foreground-normal);
}

.sync-description {
  color: var(--theme--foreground-subdued);
  font-size: 14px;
}

.sync-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 24px;
}

.sync-card {
  background: var(--theme--background-normal);
  border: var(--theme--border-width) solid var(--theme--border-color-subdued);
  border-radius: var(--theme--border-radius);
  padding: 24px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: center;
}

.sync-card:hover {
  border-color: var(--theme--primary);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.sync-card .v-icon {
  color: var(--theme--primary);
  margin-bottom: 16px;
}

.sync-card h3 {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--theme--foreground-normal);
}

.sync-card p {
  color: var(--theme--foreground-subdued);
  font-size: 14px;
  line-height: 1.5;
}

/* Dialog styles */
.dialog-card {
  min-width: 500px;
  max-width: 600px;
}

.dialog-card-large {
  min-width: 600px;
  max-width: 800px;
}

.dialog-description {
  color: var(--theme--foreground-subdued);
  margin-bottom: 16px;
}

.loading-state,
.progress-state,
.empty-state,
.error-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  color: var(--theme--foreground-subdued);
}

.error-state {
  color: var(--theme--danger);
}

.success-state {
  text-align: center;
  padding: 16px;
}

.success-icon {
  color: var(--theme--success);
  margin-bottom: 16px;
}

.export-summary,
.import-results {
  margin-top: 16px;
  padding: 12px;
  background: var(--theme--background-subdued);
  border-radius: var(--theme--border-radius);
  font-size: 14px;
}

.export-summary div,
.import-results div {
  padding: 4px 0;
}

/* File input */
.file-input-wrapper {
  margin-bottom: 16px;
}

.file-input {
  display: none;
}

/* Import summary */
.import-summary {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
}

.summary-item {
  flex: 1;
  text-align: center;
  padding: 12px;
  border-radius: var(--theme--border-radius);
}

.summary-count {
  display: block;
  font-size: 24px;
  font-weight: 700;
}

.summary-label {
  font-size: 12px;
  text-transform: uppercase;
}

.summary-new {
  background: rgba(var(--theme--success-rgb), 0.1);
  color: var(--theme--success);
}

.summary-modified {
  background: rgba(var(--theme--warning-rgb), 0.1);
  color: var(--theme--warning);
}

.summary-unchanged {
  background: var(--theme--background-subdued);
  color: var(--theme--foreground-subdued);
}

/* Import errors */
.import-errors {
  margin-top: 16px;
  padding: 12px;
  background: rgba(var(--theme--danger-rgb), 0.1);
  border-radius: var(--theme--border-radius);
  text-align: left;
}

.import-errors h4 {
  color: var(--theme--danger);
  margin-bottom: 8px;
}

.error-item {
  color: var(--theme--danger);
  font-size: 12px;
  padding: 2px 0;
}

/* Last export link */
.last-export {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 24px;
  padding: 12px 16px;
  background: var(--theme--background-subdued);
  border-radius: var(--theme--border-radius);
  font-size: 14px;
}

.last-export-icon {
  color: var(--theme--success);
}

.download-link {
  color: var(--theme--primary);
  text-decoration: none;
  font-weight: 500;
}

.download-link:hover {
  text-decoration: underline;
}

/* Error dialog */
.error-icon {
  color: var(--theme--danger);
  margin-bottom: 16px;
}

/* Download button in dialog */
.download-actions {
  margin-top: 20px;
}

.download-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  background: var(--theme--primary);
  color: white;
  border-radius: var(--theme--border-radius);
  text-decoration: none;
  font-weight: 600;
  font-size: 14px;
  transition: background 0.2s ease;
}

.download-button:hover {
  background: var(--theme--primary-accent);
  text-decoration: none;
}

.download-button .v-icon {
  color: white;
}

/* Form fields */
.form-field {
  margin-bottom: 16px;
}

.form-field label {
  display: block;
  font-weight: 600;
  margin-bottom: 6px;
  color: var(--theme--foreground-normal);
}

.success-state-inline {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--theme--success);
  margin-top: 12px;
}

/* Remote sync summary */
.remote-summary {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.summary-local-only {
  background: rgba(var(--theme--primary-rgb), 0.1);
  color: var(--theme--primary);
}

.summary-remote-only {
  background: rgba(var(--theme--secondary-rgb), 0.1);
  color: var(--theme--secondary);
}

.summary-different {
  background: rgba(var(--theme--warning-rgb), 0.1);
  color: var(--theme--warning);
}

.summary-matching {
  background: var(--theme--background-subdued);
  color: var(--theme--foreground-subdued);
}

/* Remote items list */
.remote-items-list {
  border: var(--theme--border-width) solid var(--theme--form--field--input--border-color);
  border-radius: var(--theme--border-radius);
  max-height: 350px;
  overflow-y: auto;
}

.remote-category {
  border-bottom: var(--theme--border-width) solid var(--theme--form--field--input--border-color);
}

.remote-category:last-child {
  border-bottom: none;
}

.category-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--theme--background-subdued);
  cursor: pointer;
  font-weight: 600;
}

.category-header:hover {
  background: var(--theme--background-accent);
}

.category-name {
  flex-grow: 1;
}

.category-count {
  color: var(--theme--foreground-subdued);
  font-weight: normal;
}

.category-items {
  background: var(--theme--background);
}

.remote-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px 8px 36px;
  border-bottom: var(--theme--border-width) solid var(--theme--form--field--input--border-color-hover);
  cursor: pointer;
}

.remote-item:last-child {
  border-bottom: none;
}

.remote-item:hover {
  background: var(--theme--background-accent);
}

.remote-item.item-selected {
  background: rgba(var(--theme--primary-rgb), 0.05);
}

.item-name {
  flex-grow: 1;
}

.comparison-badge {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 10px;
  text-transform: uppercase;
  font-weight: 600;
}

.comparison-local-only {
  background: rgba(var(--theme--primary-rgb), 0.15);
  color: var(--theme--primary);
}

.comparison-remote-only {
  background: rgba(118, 74, 188, 0.15);
  color: rgb(118, 74, 188);
}

.comparison-identical {
  background: var(--theme--background-subdued);
  color: var(--theme--foreground-subdued);
}

.comparison-different {
  background: rgba(var(--theme--warning-rgb), 0.15);
  color: var(--theme--warning);
}

/* Sync results */
.sync-results {
  margin-top: 16px;
  padding: 12px;
  background: var(--theme--background-subdued);
  border-radius: var(--theme--border-radius);
  font-size: 14px;
}

.sync-results div {
  padding: 4px 0;
}

/* Saved connections */
.saved-connections {
  margin-bottom: 20px;
}

.saved-connections label {
  display: block;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--theme--foreground-normal);
}

.connections-list {
  border: var(--theme--border-width) solid var(--theme--form--field--input--border-color);
  border-radius: var(--theme--border-radius);
  max-height: 150px;
  overflow-y: auto;
}

.connection-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: var(--theme--border-width) solid var(--theme--form--field--input--border-color);
  transition: background 0.15s ease;
}

.connection-item:last-child {
  border-bottom: none;
}

.connection-item:hover {
  background: var(--theme--background-accent);
}

.connection-item.connection-selected {
  background: rgba(var(--theme--primary-rgb), 0.1);
  border-left: 3px solid var(--theme--primary);
}

.connection-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.connection-name {
  font-weight: 600;
  color: var(--theme--foreground-normal);
}

.connection-url {
  font-size: 12px;
  color: var(--theme--foreground-subdued);
}

.delete-connection {
  color: var(--theme--foreground-subdued);
  opacity: 0.5;
  transition: opacity 0.15s ease, color 0.15s ease;
}

.delete-connection:hover {
  opacity: 1;
  color: var(--theme--danger);
}

.save-connection-option {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  color: var(--theme--foreground-subdued);
  font-size: 14px;
}
</style>
