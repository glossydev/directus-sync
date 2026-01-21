<template>
  <div class="tree-select">
    <div v-for="node in modelValue" :key="node.id" class="tree-node">
      <div class="node-header" :class="{ 'is-category': node.type === 'category' }">
        <v-icon
          v-if="node.children && node.children.length > 0"
          :name="node.expanded ? 'expand_more' : 'chevron_right'"
          class="expand-icon"
          clickable
          @click="toggleExpand(node)"
        />
        <span v-else class="expand-spacer"></span>

        <v-checkbox
          :model-value="node.checked"
          @update:model-value="(val: boolean) => toggleCheck(node, val)"
        />

        <span class="node-name" @click="toggleExpand(node)">{{ node.name }}</span>

        <span v-if="node.children" class="node-count">
          ({{ node.children.filter((c: TreeNode) => c.checked).length }}/{{ node.children.length }})
        </span>

        <!-- Status badge for import mode -->
        <span v-if="node.status" :class="['status-badge', `status-${node.status}`]">
          {{ node.status }}
        </span>
      </div>

      <!-- Diff details for modified items -->
      <div v-if="node.diff && node.diff.length > 0 && node.expanded !== false" class="diff-details">
        <div v-for="(change, idx) in node.diff" :key="idx" class="diff-item">
          {{ change }}
        </div>
      </div>

      <!-- Children -->
      <div v-if="node.children && node.expanded" class="node-children">
        <div v-for="child in node.children" :key="child.id" class="tree-node child-node">
          <div class="node-header">
            <span class="expand-spacer"></span>

            <v-checkbox
              :model-value="child.checked"
              @update:model-value="(val: boolean) => toggleChildCheck(node, child, val)"
            />

            <span class="node-name">{{ child.name }}</span>

            <!-- Status badge for import mode -->
            <span v-if="child.status" :class="['status-badge', `status-${child.status}`]">
              {{ child.status }}
            </span>
          </div>

          <!-- Diff details for modified items -->
          <div v-if="child.diff && child.diff.length > 0" class="diff-details">
            <div v-for="(change, idx) in child.diff" :key="idx" class="diff-item">
              {{ change }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TreeNode } from '../types';

const props = defineProps<{
  modelValue: TreeNode[];
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: TreeNode[]): void;
}>();

function toggleExpand(node: TreeNode) {
  if (!node.children || node.children.length === 0) return;

  const updated = props.modelValue.map((n) => {
    if (n.id === node.id) {
      return { ...n, expanded: !n.expanded };
    }
    return n;
  });
  emit('update:modelValue', updated);
}

function toggleCheck(node: TreeNode, checked: boolean) {
  const updated = props.modelValue.map((n) => {
    if (n.id === node.id) {
      // Also update all children
      const updatedChildren = n.children?.map((c) => ({ ...c, checked }));
      return { ...n, checked, children: updatedChildren };
    }
    return n;
  });
  emit('update:modelValue', updated);
}

function toggleChildCheck(parent: TreeNode, child: TreeNode, checked: boolean) {
  const updated = props.modelValue.map((n) => {
    if (n.id === parent.id) {
      const updatedChildren = n.children?.map((c) => {
        if (c.id === child.id) {
          return { ...c, checked };
        }
        return c;
      });
      // Update parent checked state based on children
      const allChecked = updatedChildren?.every((c) => c.checked) ?? false;
      const someChecked = updatedChildren?.some((c) => c.checked) ?? false;
      return { ...n, checked: allChecked || someChecked, children: updatedChildren };
    }
    return n;
  });
  emit('update:modelValue', updated);
}
</script>

<style scoped>
.tree-select {
  border: var(--theme--border-width) solid var(--theme--form--field--input--border-color);
  border-radius: var(--theme--border-radius);
  background: var(--theme--form--field--input--background);
  max-height: 400px;
  overflow-y: auto;
}

.tree-node {
  border-bottom: var(--theme--border-width) solid var(--theme--form--field--input--border-color);
}

.tree-node:last-child {
  border-bottom: none;
}

.node-header {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  gap: 8px;
  cursor: default;
}

.node-header.is-category {
  background: var(--theme--background-subdued);
  font-weight: 600;
}

.expand-icon {
  flex-shrink: 0;
  color: var(--theme--foreground-subdued);
}

.expand-spacer {
  width: 24px;
  flex-shrink: 0;
}

.node-name {
  flex-grow: 1;
  cursor: pointer;
}

.node-count {
  color: var(--theme--foreground-subdued);
  font-size: 12px;
}

.node-children {
  padding-left: 24px;
  background: var(--theme--background);
}

.child-node {
  border-bottom: var(--theme--border-width) solid var(--theme--form--field--input--border-color-hover);
}

.child-node:last-child {
  border-bottom: none;
}

.status-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  text-transform: uppercase;
  font-weight: 600;
}

.status-new {
  background: var(--theme--success);
  color: white;
}

.status-unchanged {
  background: var(--theme--background-subdued);
  color: var(--theme--foreground-subdued);
}

.status-modified {
  background: var(--theme--warning);
  color: white;
}

.diff-details {
  padding: 8px 12px 8px 56px;
  background: var(--theme--background-accent);
  font-size: 12px;
}

.diff-item {
  color: var(--theme--foreground-subdued);
  padding: 2px 0;
}

.diff-item::before {
  content: "• ";
  color: var(--theme--warning);
}
</style>
