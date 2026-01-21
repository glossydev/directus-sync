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
</style>
