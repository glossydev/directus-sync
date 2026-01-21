import { defineEndpoint } from '@directus/extensions-sdk';
import type {
  ExportManifest,
  CollectionExport,
  FlowExport,
  RoleExport,
  PolicyExport,
  TreeNode,
  ImportComparisonResult,
} from '../types';

export default defineEndpoint((router, context) => {
  const { services, getSchema } = context;

  router.get('/', (_req, res) => {
    res.json({
      message: 'Directus Sync API',
      version: '1.0.0',
      endpoints: {
        tree: 'GET /sync-api/tree',
        export: 'POST /sync-api/export',
        compare: 'POST /sync-api/compare',
        import: 'POST /sync-api/import',
      },
    });
  });

  // Get tree of all exportable items
  router.get('/tree', async (req, res) => {
    try {
      const schema = await getSchema();
      const { CollectionsService, FlowsService, RolesService, PoliciesService } = services;

      const collectionsService = new CollectionsService({ schema, accountability: req.accountability });
      const flowsService = new FlowsService({ schema, accountability: req.accountability });
      const rolesService = new RolesService({ schema, accountability: req.accountability });
      const policiesService = new PoliciesService({ schema, accountability: req.accountability });

      // Fetch all data
      const [collections, flows, roles, policies] = await Promise.all([
        collectionsService.readByQuery({ limit: -1 }),
        flowsService.readByQuery({ limit: -1 }),
        rolesService.readByQuery({ limit: -1 }),
        policiesService.readByQuery({ limit: -1 }),
      ]);

      // Filter out system collections (those starting with directus_)
      const userCollections = collections.filter(
        (c: any) => !c.collection.startsWith('directus_')
      );

      // Build tree structure
      const tree: TreeNode[] = [
        {
          id: 'data-model',
          name: 'Data Model',
          type: 'category',
          category: 'data-model',
          checked: true,
          expanded: true,
          children: userCollections.map((c: any) => ({
            id: `collection:${c.collection}`,
            name: c.collection,
            type: 'item' as const,
            category: 'data-model' as const,
            checked: true,
            data: c,
          })),
        },
        {
          id: 'flows',
          name: 'Flows',
          type: 'category',
          category: 'flows',
          checked: true,
          expanded: true,
          children: flows.map((f: any) => ({
            id: `flow:${f.id}`,
            name: f.name || f.id,
            type: 'item' as const,
            category: 'flows' as const,
            checked: true,
            data: f,
          })),
        },
        {
          id: 'roles',
          name: 'User Roles',
          type: 'category',
          category: 'roles',
          checked: true,
          expanded: true,
          children: roles
            .filter((r: any) => r.id !== null) // Filter out public role if it has null id
            .map((r: any) => ({
              id: `role:${r.id}`,
              name: r.name || r.id,
              type: 'item' as const,
              category: 'roles' as const,
              checked: true,
              data: r,
            })),
        },
        {
          id: 'policies',
          name: 'Access Policies',
          type: 'category',
          category: 'policies',
          checked: true,
          expanded: true,
          children: policies.map((p: any) => ({
            id: `policy:${p.id}`,
            name: p.name || p.id,
            type: 'item' as const,
            category: 'policies' as const,
            checked: true,
            data: p,
          })),
        },
      ];

      res.json({ tree });
    } catch (error: any) {
      console.error('Error fetching tree:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Export selected items
  router.post('/export', async (req, res) => {
    try {
      const schema = await getSchema();
      const { selectedIds } = req.body as { selectedIds: string[] };

      if (!selectedIds || !Array.isArray(selectedIds)) {
        return res.status(400).json({ error: 'selectedIds array is required' });
      }

      const {
        CollectionsService,
        FieldsService,
        FlowsService,
        OperationsService,
        RolesService,
        PoliciesService,
        PermissionsService,
      } = services;

      const collectionsService = new CollectionsService({ schema, accountability: req.accountability });
      const fieldsService = new FieldsService({ schema, accountability: req.accountability });
      const flowsService = new FlowsService({ schema, accountability: req.accountability });
      const operationsService = new OperationsService({ schema, accountability: req.accountability });
      const rolesService = new RolesService({ schema, accountability: req.accountability });
      const policiesService = new PoliciesService({ schema, accountability: req.accountability });
      const permissionsService = new PermissionsService({ schema, accountability: req.accountability });

      const manifest: ExportManifest = {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        contents: {
          collections: [],
          flows: [],
          roles: [],
          policies: [],
        },
      };

      // Process collections
      const collectionIds = selectedIds
        .filter((id) => id.startsWith('collection:'))
        .map((id) => id.replace('collection:', ''));

      for (const collectionName of collectionIds) {
        const collection = await collectionsService.readOne(collectionName);
        const fields = await fieldsService.readAll(collectionName);

        const collectionExport: CollectionExport = {
          collection: collectionName,
          meta: collection.meta,
          schema: collection.schema,
          fields: fields.map((f: any) => ({
            field: f.field,
            type: f.type,
            meta: f.meta,
            schema: f.schema,
          })),
        };

        manifest.contents.collections.push(collectionExport);
      }

      // Process flows
      const flowIds = selectedIds
        .filter((id) => id.startsWith('flow:'))
        .map((id) => id.replace('flow:', ''));

      for (const flowId of flowIds) {
        const flow = await flowsService.readOne(flowId);
        const operations = await operationsService.readByQuery({
          filter: { flow: { _eq: flowId } },
          limit: -1,
        });

        const flowExport: FlowExport = {
          id: flow.id,
          name: flow.name,
          icon: flow.icon,
          color: flow.color,
          description: flow.description,
          status: flow.status,
          trigger: flow.trigger,
          accountability: flow.accountability,
          options: flow.options,
          operations: operations.map((op: any) => ({
            id: op.id,
            name: op.name,
            key: op.key,
            type: op.type,
            position_x: op.position_x,
            position_y: op.position_y,
            options: op.options,
            resolve: op.resolve,
            reject: op.reject,
          })),
        };

        manifest.contents.flows.push(flowExport);
      }

      // Process roles
      const roleIds = selectedIds
        .filter((id) => id.startsWith('role:'))
        .map((id) => id.replace('role:', ''));

      for (const roleId of roleIds) {
        const role = await rolesService.readOne(roleId);

        const roleExport: RoleExport = {
          id: role.id,
          name: role.name,
          icon: role.icon,
          description: role.description,
          parent: role.parent,
        };

        manifest.contents.roles.push(roleExport);
      }

      // Process policies
      const policyIds = selectedIds
        .filter((id) => id.startsWith('policy:'))
        .map((id) => id.replace('policy:', ''));

      for (const policyId of policyIds) {
        const policy = await policiesService.readOne(policyId);
        const permissions = await permissionsService.readByQuery({
          filter: { policy: { _eq: policyId } },
          limit: -1,
        });

        // Get roles attached to this policy via the access junction
        let policyRoleIds: string[] = [];
        try {
          const { AccessService } = services;
          const accessService = new AccessService({ schema, accountability: req.accountability });
          const accessRecords = await accessService.readByQuery({
            filter: { policy: { _eq: policyId } },
            limit: -1,
          });
          policyRoleIds = accessRecords
            .filter((a: any) => a.role)
            .map((a: any) => a.role);
        } catch (e) {
          // Access service might not exist in all versions, skip role association
        }

        const policyExport: PolicyExport = {
          id: policy.id,
          name: policy.name,
          icon: policy.icon,
          description: policy.description,
          ip_access: policy.ip_access,
          enforce_tfa: policy.enforce_tfa,
          admin_access: policy.admin_access,
          app_access: policy.app_access,
          permissions: permissions.map((p: any) => ({
            collection: p.collection,
            action: p.action,
            permissions: p.permissions,
            validation: p.validation,
            presets: p.presets,
            fields: p.fields,
          })),
          roles: policyRoleIds,
        };

        manifest.contents.policies.push(policyExport);
      }

      res.json({ manifest });
    } catch (error: any) {
      console.error('Error exporting:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Compare import file with existing data
  router.post('/compare', async (req, res) => {
    try {
      const schema = await getSchema();
      const { manifest } = req.body as { manifest: ExportManifest };

      if (!manifest || !manifest.contents) {
        return res.status(400).json({ error: 'Valid manifest is required' });
      }

      const {
        CollectionsService,
        FieldsService,
        FlowsService,
        RolesService,
        PoliciesService,
      } = services;

      const collectionsService = new CollectionsService({ schema, accountability: req.accountability });
      const fieldsService = new FieldsService({ schema, accountability: req.accountability });
      const flowsService = new FlowsService({ schema, accountability: req.accountability });
      const rolesService = new RolesService({ schema, accountability: req.accountability });
      const policiesService = new PoliciesService({ schema, accountability: req.accountability });

      const result: ImportComparisonResult = {
        tree: [],
        summary: { new: 0, unchanged: 0, modified: 0 },
      };

      // Compare collections
      const collectionChildren: TreeNode[] = [];
      for (const importCollection of manifest.contents.collections) {
        let status: TreeNode['status'] = 'new';
        const diff: string[] = [];

        try {
          const existingCollection = await collectionsService.readOne(importCollection.collection);
          const existingFields = await fieldsService.readAll(importCollection.collection);

          // Compare fields
          const existingFieldNames = new Set(existingFields.map((f: any) => f.field));
          const importFieldNames = new Set(importCollection.fields.map((f) => f.field));

          const newFields = importCollection.fields.filter((f) => !existingFieldNames.has(f.field));
          const removedFields = existingFields.filter((f: any) => !importFieldNames.has(f.field));
          const commonFields = importCollection.fields.filter((f) => existingFieldNames.has(f.field));

          // Check for field differences
          for (const importField of commonFields) {
            const existingField = existingFields.find((f: any) => f.field === importField.field);
            if (existingField && importField.type !== existingField.type) {
              diff.push(`Field "${importField.field}" type changed: ${existingField.type} → ${importField.type}`);
            }
          }

          if (newFields.length > 0) {
            diff.push(`${newFields.length} new field(s): ${newFields.map((f) => f.field).join(', ')}`);
          }
          if (removedFields.length > 0) {
            diff.push(`${removedFields.length} field(s) not in import: ${removedFields.map((f: any) => f.field).join(', ')}`);
          }

          status = diff.length > 0 ? 'modified' : 'unchanged';
        } catch (e) {
          status = 'new';
        }

        result.summary[status]++;
        collectionChildren.push({
          id: `collection:${importCollection.collection}`,
          name: importCollection.collection,
          type: 'item',
          category: 'data-model',
          checked: status !== 'unchanged',
          status,
          diff,
          data: importCollection,
        });
      }

      // Compare flows
      const flowChildren: TreeNode[] = [];
      for (const importFlow of manifest.contents.flows) {
        let status: TreeNode['status'] = 'new';
        const diff: string[] = [];

        try {
          const existingFlow = await flowsService.readOne(importFlow.id);

          // Compare basic properties
          if (existingFlow.name !== importFlow.name) {
            diff.push(`Name changed: "${existingFlow.name}" → "${importFlow.name}"`);
          }
          if (existingFlow.status !== importFlow.status) {
            diff.push(`Status changed: ${existingFlow.status} → ${importFlow.status}`);
          }
          if (existingFlow.trigger !== importFlow.trigger) {
            diff.push(`Trigger changed: ${existingFlow.trigger} → ${importFlow.trigger}`);
          }

          status = diff.length > 0 ? 'modified' : 'unchanged';
        } catch (e) {
          status = 'new';
        }

        result.summary[status]++;
        flowChildren.push({
          id: `flow:${importFlow.id}`,
          name: importFlow.name || importFlow.id,
          type: 'item',
          category: 'flows',
          checked: status !== 'unchanged',
          status,
          diff,
          data: importFlow,
        });
      }

      // Compare roles
      const roleChildren: TreeNode[] = [];
      for (const importRole of manifest.contents.roles) {
        let status: TreeNode['status'] = 'new';
        const diff: string[] = [];

        try {
          const existingRole = await rolesService.readOne(importRole.id);

          if (existingRole.name !== importRole.name) {
            diff.push(`Name changed: "${existingRole.name}" → "${importRole.name}"`);
          }
          if (existingRole.icon !== importRole.icon) {
            diff.push(`Icon changed: ${existingRole.icon} → ${importRole.icon}`);
          }

          status = diff.length > 0 ? 'modified' : 'unchanged';
        } catch (e) {
          status = 'new';
        }

        result.summary[status]++;
        roleChildren.push({
          id: `role:${importRole.id}`,
          name: importRole.name || importRole.id,
          type: 'item',
          category: 'roles',
          checked: status !== 'unchanged',
          status,
          diff,
          data: importRole,
        });
      }

      // Compare policies
      const policyChildren: TreeNode[] = [];
      for (const importPolicy of manifest.contents.policies) {
        let status: TreeNode['status'] = 'new';
        const diff: string[] = [];

        try {
          const existingPolicy = await policiesService.readOne(importPolicy.id);

          if (existingPolicy.name !== importPolicy.name) {
            diff.push(`Name changed: "${existingPolicy.name}" → "${importPolicy.name}"`);
          }
          if (existingPolicy.admin_access !== importPolicy.admin_access) {
            diff.push(`Admin access changed: ${existingPolicy.admin_access} → ${importPolicy.admin_access}`);
          }
          if (existingPolicy.app_access !== importPolicy.app_access) {
            diff.push(`App access changed: ${existingPolicy.app_access} → ${importPolicy.app_access}`);
          }

          status = diff.length > 0 ? 'modified' : 'unchanged';
        } catch (e) {
          status = 'new';
        }

        result.summary[status]++;
        policyChildren.push({
          id: `policy:${importPolicy.id}`,
          name: importPolicy.name || importPolicy.id,
          type: 'item',
          category: 'policies',
          checked: status !== 'unchanged',
          status,
          diff,
          data: importPolicy,
        });
      }

      // Build tree
      result.tree = [
        {
          id: 'data-model',
          name: 'Data Model',
          type: 'category',
          category: 'data-model',
          checked: collectionChildren.some((c) => c.checked),
          expanded: true,
          children: collectionChildren,
        },
        {
          id: 'flows',
          name: 'Flows',
          type: 'category',
          category: 'flows',
          checked: flowChildren.some((c) => c.checked),
          expanded: true,
          children: flowChildren,
        },
        {
          id: 'roles',
          name: 'User Roles',
          type: 'category',
          category: 'roles',
          checked: roleChildren.some((c) => c.checked),
          expanded: true,
          children: roleChildren,
        },
        {
          id: 'policies',
          name: 'Access Policies',
          type: 'category',
          category: 'policies',
          checked: policyChildren.some((c) => c.checked),
          expanded: true,
          children: policyChildren,
        },
      ];

      res.json(result);
    } catch (error: any) {
      console.error('Error comparing:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Apply import
  router.post('/import', async (req, res) => {
    try {
      const schema = await getSchema();
      const { manifest, selectedIds } = req.body as {
        manifest: ExportManifest;
        selectedIds: string[];
      };

      if (!manifest || !selectedIds) {
        return res.status(400).json({ error: 'manifest and selectedIds are required' });
      }

      const {
        CollectionsService,
        FieldsService,
        FlowsService,
        OperationsService,
        RolesService,
        PoliciesService,
        PermissionsService,
      } = services;

      const collectionsService = new CollectionsService({ schema, accountability: req.accountability });
      const fieldsService = new FieldsService({ schema, accountability: req.accountability });
      const flowsService = new FlowsService({ schema, accountability: req.accountability });
      const operationsService = new OperationsService({ schema, accountability: req.accountability });
      const rolesService = new RolesService({ schema, accountability: req.accountability });
      const policiesService = new PoliciesService({ schema, accountability: req.accountability });
      const permissionsService = new PermissionsService({ schema, accountability: req.accountability });

      const results = {
        collections: { created: 0, updated: 0, errors: [] as string[] },
        flows: { created: 0, updated: 0, errors: [] as string[] },
        roles: { created: 0, updated: 0, errors: [] as string[] },
        policies: { created: 0, updated: 0, errors: [] as string[] },
      };

      // Import collections
      const collectionIds = selectedIds
        .filter((id) => id.startsWith('collection:'))
        .map((id) => id.replace('collection:', ''));

      for (const collectionName of collectionIds) {
        const importCollection = manifest.contents.collections.find(
          (c) => c.collection === collectionName
        );
        if (!importCollection) continue;

        try {
          // Check if collection exists
          let exists = false;
          try {
            await collectionsService.readOne(collectionName);
            exists = true;
          } catch (e) {
            exists = false;
          }

          if (exists) {
            // Update existing collection - update fields
            for (const field of importCollection.fields) {
              try {
                await fieldsService.readOne(collectionName, field.field);
                // Field exists, update it
                await fieldsService.updateOne(collectionName, field.field, {
                  type: field.type,
                  meta: field.meta,
                  schema: field.schema,
                });
              } catch (e) {
                // Field doesn't exist, create it
                await fieldsService.createOne({
                  collection: collectionName,
                  field: field.field,
                  type: field.type,
                  meta: field.meta,
                  schema: field.schema,
                });
              }
            }
            results.collections.updated++;
          } else {
            // Create new collection
            await collectionsService.createOne({
              collection: collectionName,
              meta: importCollection.meta,
              schema: importCollection.schema,
              fields: importCollection.fields.map((f) => ({
                field: f.field,
                type: f.type,
                meta: f.meta,
                schema: f.schema,
              })),
            });
            results.collections.created++;
          }
        } catch (error: any) {
          results.collections.errors.push(`${collectionName}: ${error.message}`);
        }
      }

      // Import roles (before policies since policies may reference roles)
      const roleIds = selectedIds
        .filter((id) => id.startsWith('role:'))
        .map((id) => id.replace('role:', ''));

      for (const roleId of roleIds) {
        const importRole = manifest.contents.roles.find((r) => r.id === roleId);
        if (!importRole) continue;

        try {
          let exists = false;
          try {
            await rolesService.readOne(roleId);
            exists = true;
          } catch (e) {
            exists = false;
          }

          if (exists) {
            await rolesService.updateOne(roleId, {
              name: importRole.name,
              icon: importRole.icon,
              description: importRole.description,
              parent: importRole.parent,
            });
            results.roles.updated++;
          } else {
            await rolesService.createOne({
              id: importRole.id,
              name: importRole.name,
              icon: importRole.icon,
              description: importRole.description,
              parent: importRole.parent,
            });
            results.roles.created++;
          }
        } catch (error: any) {
          results.roles.errors.push(`${importRole.name}: ${error.message}`);
        }
      }

      // Import policies
      const policyIds = selectedIds
        .filter((id) => id.startsWith('policy:'))
        .map((id) => id.replace('policy:', ''));

      for (const policyId of policyIds) {
        const importPolicy = manifest.contents.policies.find((p) => p.id === policyId);
        if (!importPolicy) continue;

        try {
          let exists = false;
          try {
            await policiesService.readOne(policyId);
            exists = true;
          } catch (e) {
            exists = false;
          }

          if (exists) {
            await policiesService.updateOne(policyId, {
              name: importPolicy.name,
              icon: importPolicy.icon,
              description: importPolicy.description,
              ip_access: importPolicy.ip_access,
              enforce_tfa: importPolicy.enforce_tfa,
              admin_access: importPolicy.admin_access,
              app_access: importPolicy.app_access,
            });

            // Update permissions - delete existing and recreate
            const existingPermissions = await permissionsService.readByQuery({
              filter: { policy: { _eq: policyId } },
              limit: -1,
            });
            for (const perm of existingPermissions) {
              await permissionsService.deleteOne(perm.id);
            }
            for (const perm of importPolicy.permissions) {
              await permissionsService.createOne({
                policy: policyId,
                collection: perm.collection,
                action: perm.action,
                permissions: perm.permissions,
                validation: perm.validation,
                presets: perm.presets,
                fields: perm.fields,
              });
            }

            results.policies.updated++;
          } else {
            await policiesService.createOne({
              id: importPolicy.id,
              name: importPolicy.name,
              icon: importPolicy.icon,
              description: importPolicy.description,
              ip_access: importPolicy.ip_access,
              enforce_tfa: importPolicy.enforce_tfa,
              admin_access: importPolicy.admin_access,
              app_access: importPolicy.app_access,
            });

            // Create permissions
            for (const perm of importPolicy.permissions) {
              await permissionsService.createOne({
                policy: policyId,
                collection: perm.collection,
                action: perm.action,
                permissions: perm.permissions,
                validation: perm.validation,
                presets: perm.presets,
                fields: perm.fields,
              });
            }

            results.policies.created++;
          }
        } catch (error: any) {
          results.policies.errors.push(`${importPolicy.name}: ${error.message}`);
        }
      }

      // Import flows
      const flowIds = selectedIds
        .filter((id) => id.startsWith('flow:'))
        .map((id) => id.replace('flow:', ''));

      for (const flowId of flowIds) {
        const importFlow = manifest.contents.flows.find((f) => f.id === flowId);
        if (!importFlow) continue;

        try {
          let exists = false;
          try {
            await flowsService.readOne(flowId);
            exists = true;
          } catch (e) {
            exists = false;
          }

          if (exists) {
            // Update flow
            await flowsService.updateOne(flowId, {
              name: importFlow.name,
              icon: importFlow.icon,
              color: importFlow.color,
              description: importFlow.description,
              status: importFlow.status,
              trigger: importFlow.trigger,
              accountability: importFlow.accountability,
              options: importFlow.options,
            });

            // Delete existing operations and recreate
            const existingOps = await operationsService.readByQuery({
              filter: { flow: { _eq: flowId } },
              limit: -1,
            });
            for (const op of existingOps) {
              await operationsService.deleteOne(op.id);
            }

            // Create operations (need to handle references)
            const opIdMap = new Map<string, string>();
            for (const op of importFlow.operations) {
              const newOp = await operationsService.createOne({
                id: op.id,
                flow: flowId,
                name: op.name,
                key: op.key,
                type: op.type,
                position_x: op.position_x,
                position_y: op.position_y,
                options: op.options,
              });
              opIdMap.set(op.id, newOp);
            }

            // Update operation references
            for (const op of importFlow.operations) {
              if (op.resolve || op.reject) {
                await operationsService.updateOne(op.id, {
                  resolve: op.resolve,
                  reject: op.reject,
                });
              }
            }

            results.flows.updated++;
          } else {
            // Create flow first without operation reference
            await flowsService.createOne({
              id: importFlow.id,
              name: importFlow.name,
              icon: importFlow.icon,
              color: importFlow.color,
              description: importFlow.description,
              status: importFlow.status,
              trigger: importFlow.trigger,
              accountability: importFlow.accountability,
              options: importFlow.options,
            });

            // Create operations
            for (const op of importFlow.operations) {
              await operationsService.createOne({
                id: op.id,
                flow: flowId,
                name: op.name,
                key: op.key,
                type: op.type,
                position_x: op.position_x,
                position_y: op.position_y,
                options: op.options,
              });
            }

            // Update operation references
            for (const op of importFlow.operations) {
              if (op.resolve || op.reject) {
                await operationsService.updateOne(op.id, {
                  resolve: op.resolve,
                  reject: op.reject,
                });
              }
            }

            // Update flow with first operation
            const firstOp = importFlow.operations.find(
              (op) => !importFlow.operations.some((o) => o.resolve === op.id || o.reject === op.id)
            );
            if (firstOp) {
              await flowsService.updateOne(flowId, { operation: firstOp.id });
            }

            results.flows.created++;
          }
        } catch (error: any) {
          results.flows.errors.push(`${importFlow.name}: ${error.message}`);
        }
      }

      res.json({ success: true, results });
    } catch (error: any) {
      console.error('Error importing:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Test remote connection
  router.post('/remote/test', async (req, res) => {
    try {
      const { url, token } = req.body as { url: string; token: string };

      if (!url || !token) {
        return res.status(400).json({ error: 'URL and token are required' });
      }

      // Normalize URL
      const baseUrl = url.replace(/\/+$/, '');

      // Test connection by fetching server info
      const response = await fetch(`${baseUrl}/server/info`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.text();
        return res.status(response.status).json({ error: `Connection failed: ${error}` });
      }

      const info = await response.json();
      res.json({ success: true, info: info.data });
    } catch (error: any) {
      console.error('Remote connection test failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Fetch remote data for comparison
  router.post('/remote/scan', async (req, res) => {
    try {
      const { url, token } = req.body as { url: string; token: string };

      if (!url || !token) {
        return res.status(400).json({ error: 'URL and token are required' });
      }

      const baseUrl = url.replace(/\/+$/, '');
      const headers = { Authorization: `Bearer ${token}` };

      // Fetch remote collections
      const collectionsRes = await fetch(`${baseUrl}/collections`, { headers });
      if (!collectionsRes.ok) throw new Error('Failed to fetch remote collections');
      const collectionsData = await collectionsRes.json();
      const remoteCollectionsRaw = (collectionsData.data || []).filter(
        (c: any) => !c.collection.startsWith('directus_')
      );

      // Fetch fields for each remote collection
      const remoteCollections = await Promise.all(
        remoteCollectionsRaw.map(async (c: any) => {
          try {
            const fieldsRes = await fetch(`${baseUrl}/fields/${c.collection}`, { headers });
            const fieldsData = fieldsRes.ok ? await fieldsRes.json() : { data: [] };
            return { ...c, fields: fieldsData.data || [] };
          } catch (e) {
            return { ...c, fields: [] };
          }
        })
      );

      // Fetch remote flows
      const flowsRes = await fetch(`${baseUrl}/flows`, { headers });
      if (!flowsRes.ok) throw new Error('Failed to fetch remote flows');
      const flowsData = await flowsRes.json();
      const remoteFlows = flowsData.data || [];

      // Fetch remote roles
      const rolesRes = await fetch(`${baseUrl}/roles`, { headers });
      if (!rolesRes.ok) throw new Error('Failed to fetch remote roles');
      const rolesData = await rolesRes.json();
      const remoteRoles = (rolesData.data || []).filter((r: any) => r.id !== null);

      // Fetch remote policies
      const policiesRes = await fetch(`${baseUrl}/policies`, { headers });
      if (!policiesRes.ok) throw new Error('Failed to fetch remote policies');
      const policiesData = await policiesRes.json();
      const remotePolicies = policiesData.data || [];

      // Get local data for comparison
      const schema = await getSchema();
      const { CollectionsService, FieldsService, FlowsService, RolesService, PoliciesService } = services;

      const collectionsService = new CollectionsService({ schema, accountability: req.accountability });
      const fieldsService = new FieldsService({ schema, accountability: req.accountability });
      const flowsService = new FlowsService({ schema, accountability: req.accountability });
      const rolesService = new RolesService({ schema, accountability: req.accountability });
      const policiesService = new PoliciesService({ schema, accountability: req.accountability });

      const [localCollectionsRaw, localFlows, localRoles, localPolicies] = await Promise.all([
        collectionsService.readByQuery({ limit: -1 }),
        flowsService.readByQuery({ limit: -1 }),
        rolesService.readByQuery({ limit: -1 }),
        policiesService.readByQuery({ limit: -1 }),
      ]);

      const filteredLocalCollectionsRaw = localCollectionsRaw.filter(
        (c: any) => !c.collection.startsWith('directus_')
      );

      // Fetch fields for each local collection
      const filteredLocalCollections = await Promise.all(
        filteredLocalCollectionsRaw.map(async (c: any) => {
          try {
            const fields = await fieldsService.readAll(c.collection);
            return { ...c, fields: fields || [] };
          } catch (e) {
            return { ...c, fields: [] };
          }
        })
      );

      const filteredLocalRoles = localRoles.filter((r: any) => r.id !== null);

      // Build comparison tree
      const comparison = {
        collections: compareItems(
          filteredLocalCollections.map((c: any) => ({ id: c.collection, name: c.collection, data: c })),
          remoteCollections.map((c: any) => ({ id: c.collection, name: c.collection, data: c })),
          'collection'
        ),
        flows: compareItems(
          localFlows.map((f: any) => ({ id: f.id, name: f.name || f.id, data: f })),
          remoteFlows.map((f: any) => ({ id: f.id, name: f.name || f.id, data: f })),
          'flow'
        ),
        roles: compareItems(
          filteredLocalRoles.map((r: any) => ({ id: r.id, name: r.name || r.id, data: r })),
          remoteRoles.map((r: any) => ({ id: r.id, name: r.name || r.id, data: r })),
          'role'
        ),
        policies: compareItems(
          localPolicies.map((p: any) => ({ id: p.id, name: p.name || p.id, data: p })),
          remotePolicies.map((p: any) => ({ id: p.id, name: p.name || p.id, data: p })),
          'policy'
        ),
      };

      // Calculate summary
      const allItems = [
        ...comparison.collections,
        ...comparison.flows,
        ...comparison.roles,
        ...comparison.policies,
      ];

      const summary = {
        localOnly: allItems.filter((i) => i.comparison === 'local-only').length,
        remoteOnly: allItems.filter((i) => i.comparison === 'remote-only').length,
        matching: allItems.filter((i) => i.comparison === 'identical').length,
        different: allItems.filter((i) => i.comparison === 'different').length,
      };

      res.json({ comparison, summary });
    } catch (error: any) {
      console.error('Remote scan failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Push items to remote
  router.post('/remote/push', async (req, res) => {
    try {
      const { url, token, selectedIds } = req.body as {
        url: string;
        token: string;
        selectedIds: string[];
      };

      if (!url || !token || !selectedIds) {
        return res.status(400).json({ error: 'URL, token, and selectedIds are required' });
      }

      const baseUrl = url.replace(/\/+$/, '');
      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      const schema = await getSchema();
      const {
        CollectionsService,
        FieldsService,
        FlowsService,
        OperationsService,
        RolesService,
        PoliciesService,
        PermissionsService,
      } = services;

      const collectionsService = new CollectionsService({ schema, accountability: req.accountability });
      const fieldsService = new FieldsService({ schema, accountability: req.accountability });
      const flowsService = new FlowsService({ schema, accountability: req.accountability });
      const operationsService = new OperationsService({ schema, accountability: req.accountability });
      const rolesService = new RolesService({ schema, accountability: req.accountability });
      const policiesService = new PoliciesService({ schema, accountability: req.accountability });
      const permissionsService = new PermissionsService({ schema, accountability: req.accountability });

      const results = {
        collections: { pushed: 0, errors: [] as string[] },
        flows: { pushed: 0, errors: [] as string[] },
        roles: { pushed: 0, errors: [] as string[] },
        policies: { pushed: 0, errors: [] as string[] },
      };

      // Push collections
      const collectionIds = selectedIds
        .filter((id) => id.startsWith('collection:'))
        .map((id) => id.replace('collection:', ''));

      for (const collectionName of collectionIds) {
        try {
          const collection = await collectionsService.readOne(collectionName);
          const fields = await fieldsService.readAll(collectionName);

          // Check if collection exists on remote
          const checkRes = await fetch(`${baseUrl}/collections/${collectionName}`, { headers });

          if (checkRes.ok) {
            // Update existing - push fields
            for (const field of fields) {
              const fieldCheckRes = await fetch(
                `${baseUrl}/fields/${collectionName}/${field.field}`,
                { headers }
              );

              if (fieldCheckRes.ok) {
                await fetch(`${baseUrl}/fields/${collectionName}/${field.field}`, {
                  method: 'PATCH',
                  headers,
                  body: JSON.stringify({
                    type: field.type,
                    meta: field.meta,
                    schema: field.schema,
                  }),
                });
              } else {
                await fetch(`${baseUrl}/fields/${collectionName}`, {
                  method: 'POST',
                  headers,
                  body: JSON.stringify({
                    field: field.field,
                    type: field.type,
                    meta: field.meta,
                    schema: field.schema,
                  }),
                });
              }
            }
          } else {
            // Create new collection
            await fetch(`${baseUrl}/collections`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                collection: collectionName,
                meta: collection.meta,
                schema: collection.schema,
                fields: fields.map((f: any) => ({
                  field: f.field,
                  type: f.type,
                  meta: f.meta,
                  schema: f.schema,
                })),
              }),
            });
          }
          results.collections.pushed++;
        } catch (error: any) {
          results.collections.errors.push(`${collectionName}: ${error.message}`);
        }
      }

      // Push roles
      const roleIds = selectedIds
        .filter((id) => id.startsWith('role:'))
        .map((id) => id.replace('role:', ''));

      for (const roleId of roleIds) {
        try {
          const role = await rolesService.readOne(roleId);
          const checkRes = await fetch(`${baseUrl}/roles/${roleId}`, { headers });

          const roleData = {
            name: role.name,
            icon: role.icon,
            description: role.description,
            parent: role.parent,
          };

          if (checkRes.ok) {
            await fetch(`${baseUrl}/roles/${roleId}`, {
              method: 'PATCH',
              headers,
              body: JSON.stringify(roleData),
            });
          } else {
            await fetch(`${baseUrl}/roles`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ id: roleId, ...roleData }),
            });
          }
          results.roles.pushed++;
        } catch (error: any) {
          results.roles.errors.push(`${roleId}: ${error.message}`);
        }
      }

      // Push policies
      const policyIds = selectedIds
        .filter((id) => id.startsWith('policy:'))
        .map((id) => id.replace('policy:', ''));

      for (const policyId of policyIds) {
        try {
          const policy = await policiesService.readOne(policyId);
          const permissions = await permissionsService.readByQuery({
            filter: { policy: { _eq: policyId } },
            limit: -1,
          });

          const checkRes = await fetch(`${baseUrl}/policies/${policyId}`, { headers });

          const policyData = {
            name: policy.name,
            icon: policy.icon,
            description: policy.description,
            ip_access: policy.ip_access,
            enforce_tfa: policy.enforce_tfa,
            admin_access: policy.admin_access,
            app_access: policy.app_access,
          };

          if (checkRes.ok) {
            await fetch(`${baseUrl}/policies/${policyId}`, {
              method: 'PATCH',
              headers,
              body: JSON.stringify(policyData),
            });

            // Delete existing permissions and recreate
            const remotePermsRes = await fetch(
              `${baseUrl}/permissions?filter[policy][_eq]=${policyId}`,
              { headers }
            );
            if (remotePermsRes.ok) {
              const remotePerms = await remotePermsRes.json();
              for (const perm of remotePerms.data || []) {
                await fetch(`${baseUrl}/permissions/${perm.id}`, {
                  method: 'DELETE',
                  headers,
                });
              }
            }
          } else {
            await fetch(`${baseUrl}/policies`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ id: policyId, ...policyData }),
            });
          }

          // Create permissions
          for (const perm of permissions) {
            await fetch(`${baseUrl}/permissions`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                policy: policyId,
                collection: perm.collection,
                action: perm.action,
                permissions: perm.permissions,
                validation: perm.validation,
                presets: perm.presets,
                fields: perm.fields,
              }),
            });
          }

          results.policies.pushed++;
        } catch (error: any) {
          results.policies.errors.push(`${policyId}: ${error.message}`);
        }
      }

      // Push flows
      const flowIds = selectedIds
        .filter((id) => id.startsWith('flow:'))
        .map((id) => id.replace('flow:', ''));

      for (const flowId of flowIds) {
        try {
          const flow = await flowsService.readOne(flowId);
          const operations = await operationsService.readByQuery({
            filter: { flow: { _eq: flowId } },
            limit: -1,
          });

          const checkRes = await fetch(`${baseUrl}/flows/${flowId}`, { headers });

          const flowData = {
            name: flow.name,
            icon: flow.icon,
            color: flow.color,
            description: flow.description,
            status: flow.status,
            trigger: flow.trigger,
            accountability: flow.accountability,
            options: flow.options,
          };

          if (checkRes.ok) {
            // Update flow
            await fetch(`${baseUrl}/flows/${flowId}`, {
              method: 'PATCH',
              headers,
              body: JSON.stringify(flowData),
            });

            // Delete existing operations
            const remoteOpsRes = await fetch(
              `${baseUrl}/operations?filter[flow][_eq]=${flowId}`,
              { headers }
            );
            if (remoteOpsRes.ok) {
              const remoteOps = await remoteOpsRes.json();
              for (const op of remoteOps.data || []) {
                await fetch(`${baseUrl}/operations/${op.id}`, {
                  method: 'DELETE',
                  headers,
                });
              }
            }
          } else {
            await fetch(`${baseUrl}/flows`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ id: flowId, ...flowData }),
            });
          }

          // Create operations
          for (const op of operations) {
            await fetch(`${baseUrl}/operations`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                id: op.id,
                flow: flowId,
                name: op.name,
                key: op.key,
                type: op.type,
                position_x: op.position_x,
                position_y: op.position_y,
                options: op.options,
              }),
            });
          }

          // Update operation references
          for (const op of operations) {
            if (op.resolve || op.reject) {
              await fetch(`${baseUrl}/operations/${op.id}`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                  resolve: op.resolve,
                  reject: op.reject,
                }),
              });
            }
          }

          // Update flow with first operation
          const firstOp = operations.find(
            (op: any) => !operations.some((o: any) => o.resolve === op.id || o.reject === op.id)
          );
          if (firstOp) {
            await fetch(`${baseUrl}/flows/${flowId}`, {
              method: 'PATCH',
              headers,
              body: JSON.stringify({ operation: firstOp.id }),
            });
          }

          results.flows.pushed++;
        } catch (error: any) {
          results.flows.errors.push(`${flowId}: ${error.message}`);
        }
      }

      res.json({ success: true, results });
    } catch (error: any) {
      console.error('Push failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Pull items from remote
  router.post('/remote/pull', async (req, res) => {
    try {
      const { url, token, selectedIds } = req.body as {
        url: string;
        token: string;
        selectedIds: string[];
      };

      if (!url || !token || !selectedIds) {
        return res.status(400).json({ error: 'URL, token, and selectedIds are required' });
      }

      const baseUrl = url.replace(/\/+$/, '');
      const headers = { Authorization: `Bearer ${token}` };

      const schema = await getSchema();
      const {
        CollectionsService,
        FieldsService,
        FlowsService,
        OperationsService,
        RolesService,
        PoliciesService,
        PermissionsService,
      } = services;

      const collectionsService = new CollectionsService({ schema, accountability: req.accountability });
      const fieldsService = new FieldsService({ schema, accountability: req.accountability });
      const flowsService = new FlowsService({ schema, accountability: req.accountability });
      const operationsService = new OperationsService({ schema, accountability: req.accountability });
      const rolesService = new RolesService({ schema, accountability: req.accountability });
      const policiesService = new PoliciesService({ schema, accountability: req.accountability });
      const permissionsService = new PermissionsService({ schema, accountability: req.accountability });

      const results = {
        collections: { pulled: 0, errors: [] as string[] },
        flows: { pulled: 0, errors: [] as string[] },
        roles: { pulled: 0, errors: [] as string[] },
        policies: { pulled: 0, errors: [] as string[] },
      };

      // Pull collections
      const collectionIds = selectedIds
        .filter((id) => id.startsWith('collection:'))
        .map((id) => id.replace('collection:', ''));

      for (const collectionName of collectionIds) {
        try {
          // Fetch from remote
          const collectionRes = await fetch(`${baseUrl}/collections/${collectionName}`, { headers });
          if (!collectionRes.ok) throw new Error('Collection not found on remote');
          const collectionData = await collectionRes.json();
          const remoteCollection = collectionData.data;

          const fieldsRes = await fetch(`${baseUrl}/fields/${collectionName}`, { headers });
          if (!fieldsRes.ok) throw new Error('Fields not found on remote');
          const fieldsData = await fieldsRes.json();
          const remoteFields = fieldsData.data || [];

          // Check if exists locally
          let exists = false;
          try {
            await collectionsService.readOne(collectionName);
            exists = true;
          } catch (e) {
            exists = false;
          }

          if (exists) {
            // Update fields
            for (const field of remoteFields) {
              // Check if field exists separately from update
              let fieldExists = false;
              try {
                await fieldsService.readOne(collectionName, field.field);
                fieldExists = true;
              } catch (e) {
                fieldExists = false;
              }

              if (fieldExists) {
                // Update existing field - only update meta (UI settings), not schema (database column)
                // Changing schema would require database migrations which is problematic
                if (field.meta) {
                  await fieldsService.updateField(collectionName, {
                    field: field.field,
                    meta: field.meta,
                  });
                }
              } else {
                // Create new field - FieldsService uses createField, not createOne
                await fieldsService.createField(collectionName, {
                  field: field.field,
                  type: field.type,
                  meta: field.meta,
                  schema: field.schema,
                });
              }
            }
          } else {
            // Create collection
            await collectionsService.createOne({
              collection: collectionName,
              meta: remoteCollection.meta,
              schema: remoteCollection.schema,
              fields: remoteFields.map((f: any) => ({
                field: f.field,
                type: f.type,
                meta: f.meta,
                schema: f.schema,
              })),
            });
          }
          results.collections.pulled++;
        } catch (error: any) {
          results.collections.errors.push(`${collectionName}: ${error.message}`);
        }
      }

      // Pull roles
      const roleIds = selectedIds
        .filter((id) => id.startsWith('role:'))
        .map((id) => id.replace('role:', ''));

      for (const roleId of roleIds) {
        try {
          const roleRes = await fetch(`${baseUrl}/roles/${roleId}`, { headers });
          if (!roleRes.ok) throw new Error('Role not found on remote');
          const roleData = await roleRes.json();
          const remoteRole = roleData.data;

          let exists = false;
          try {
            await rolesService.readOne(roleId);
            exists = true;
          } catch (e) {
            exists = false;
          }

          if (exists) {
            await rolesService.updateOne(roleId, {
              name: remoteRole.name,
              icon: remoteRole.icon,
              description: remoteRole.description,
              parent: remoteRole.parent,
            });
          } else {
            await rolesService.createOne({
              id: roleId,
              name: remoteRole.name,
              icon: remoteRole.icon,
              description: remoteRole.description,
              parent: remoteRole.parent,
            });
          }
          results.roles.pulled++;
        } catch (error: any) {
          results.roles.errors.push(`${roleId}: ${error.message}`);
        }
      }

      // Pull policies
      const policyIds = selectedIds
        .filter((id) => id.startsWith('policy:'))
        .map((id) => id.replace('policy:', ''));

      for (const policyId of policyIds) {
        try {
          const policyRes = await fetch(`${baseUrl}/policies/${policyId}`, { headers });
          if (!policyRes.ok) throw new Error('Policy not found on remote');
          const policyData = await policyRes.json();
          const remotePolicy = policyData.data;

          const permsRes = await fetch(
            `${baseUrl}/permissions?filter[policy][_eq]=${policyId}&limit=-1`,
            { headers }
          );
          const permsData = await permsRes.json();
          const remotePermissions = permsData.data || [];

          let exists = false;
          try {
            await policiesService.readOne(policyId);
            exists = true;
          } catch (e) {
            exists = false;
          }

          if (exists) {
            await policiesService.updateOne(policyId, {
              name: remotePolicy.name,
              icon: remotePolicy.icon,
              description: remotePolicy.description,
              ip_access: remotePolicy.ip_access,
              enforce_tfa: remotePolicy.enforce_tfa,
              admin_access: remotePolicy.admin_access,
              app_access: remotePolicy.app_access,
            });

            // Delete and recreate permissions
            const existingPerms = await permissionsService.readByQuery({
              filter: { policy: { _eq: policyId } },
              limit: -1,
            });
            for (const perm of existingPerms) {
              await permissionsService.deleteOne(perm.id);
            }
          } else {
            await policiesService.createOne({
              id: policyId,
              name: remotePolicy.name,
              icon: remotePolicy.icon,
              description: remotePolicy.description,
              ip_access: remotePolicy.ip_access,
              enforce_tfa: remotePolicy.enforce_tfa,
              admin_access: remotePolicy.admin_access,
              app_access: remotePolicy.app_access,
            });
          }

          // Create permissions
          for (const perm of remotePermissions) {
            await permissionsService.createOne({
              policy: policyId,
              collection: perm.collection,
              action: perm.action,
              permissions: perm.permissions,
              validation: perm.validation,
              presets: perm.presets,
              fields: perm.fields,
            });
          }

          results.policies.pulled++;
        } catch (error: any) {
          results.policies.errors.push(`${policyId}: ${error.message}`);
        }
      }

      // Pull flows
      const flowIds = selectedIds
        .filter((id) => id.startsWith('flow:'))
        .map((id) => id.replace('flow:', ''));

      for (const flowId of flowIds) {
        try {
          const flowRes = await fetch(`${baseUrl}/flows/${flowId}`, { headers });
          if (!flowRes.ok) throw new Error('Flow not found on remote');
          const flowData = await flowRes.json();
          const remoteFlow = flowData.data;

          const opsRes = await fetch(
            `${baseUrl}/operations?filter[flow][_eq]=${flowId}&limit=-1`,
            { headers }
          );
          const opsData = await opsRes.json();
          const remoteOperations = opsData.data || [];

          let exists = false;
          try {
            await flowsService.readOne(flowId);
            exists = true;
          } catch (e) {
            exists = false;
          }

          if (exists) {
            await flowsService.updateOne(flowId, {
              name: remoteFlow.name,
              icon: remoteFlow.icon,
              color: remoteFlow.color,
              description: remoteFlow.description,
              status: remoteFlow.status,
              trigger: remoteFlow.trigger,
              accountability: remoteFlow.accountability,
              options: remoteFlow.options,
            });

            // Delete existing operations
            const existingOps = await operationsService.readByQuery({
              filter: { flow: { _eq: flowId } },
              limit: -1,
            });
            for (const op of existingOps) {
              await operationsService.deleteOne(op.id);
            }
          } else {
            await flowsService.createOne({
              id: flowId,
              name: remoteFlow.name,
              icon: remoteFlow.icon,
              color: remoteFlow.color,
              description: remoteFlow.description,
              status: remoteFlow.status,
              trigger: remoteFlow.trigger,
              accountability: remoteFlow.accountability,
              options: remoteFlow.options,
            });
          }

          // Create operations
          for (const op of remoteOperations) {
            await operationsService.createOne({
              id: op.id,
              flow: flowId,
              name: op.name,
              key: op.key,
              type: op.type,
              position_x: op.position_x,
              position_y: op.position_y,
              options: op.options,
            });
          }

          // Update operation references
          for (const op of remoteOperations) {
            if (op.resolve || op.reject) {
              await operationsService.updateOne(op.id, {
                resolve: op.resolve,
                reject: op.reject,
              });
            }
          }

          // Update flow with first operation
          const firstOp = remoteOperations.find(
            (op: any) => !remoteOperations.some((o: any) => o.resolve === op.id || o.reject === op.id)
          );
          if (firstOp) {
            await flowsService.updateOne(flowId, { operation: firstOp.id });
          }

          results.flows.pulled++;
        } catch (error: any) {
          results.flows.errors.push(`${flowId}: ${error.message}`);
        }
      }

      res.json({ success: true, results });
    } catch (error: any) {
      console.error('Pull failed:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

// Helper function to normalize data for comparison by removing instance-specific fields
function normalizeForComparison(data: any, type: 'collection' | 'flow' | 'role' | 'policy'): any {
  if (!data) return data;

  // Fields to ignore during comparison (instance-specific or auto-generated)
  const ignoredFields = [
    // Timestamp fields
    'date_created',
    'date_updated',
    'timestamp',
    // User reference fields
    'user_created',
    'user_updated',
    // Collection meta fields that are instance-specific
    'group',
    // Field meta fields that can vary between instances
    'id', // Field IDs are auto-generated
    'width',
    'sort',
    'translations',
    'conditions',
    'required',
    'readonly',
    'hidden',
    'display',
    'display_options',
    'validation',
    'validation_message',
    // Schema fields that can vary between instances
    'foreign_key_schema',
    'foreign_key_table',
    'foreign_key_column',
    'default_value',
    'max_length',
    'is_nullable',
    'is_unique',
    'is_primary_key',
    'has_auto_increment',
    'numeric_precision',
    'numeric_scale',
    'comment',
    'schema', // Entire schema object can vary
    // Operation references (handled separately during sync)
    'operation',
    // Users field (role-specific)
    'users',
    // Policies field (role-specific)
    'policies',
    // Children (role hierarchy)
    'children',
    // Fields array - compare separately by field name, not entire array
    'fields',
  ];

  // Deep clone and clean the object
  const cleaned = JSON.parse(JSON.stringify(data));

  function removeIgnoredFields(obj: any): any {
    if (obj === null || typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
      return obj.map(removeIgnoredFields);
    }

    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (ignoredFields.includes(key)) continue;
      result[key] = removeIgnoredFields(value);
    }
    return result;
  }

  return removeIgnoredFields(cleaned);
}

// Helper function to compare collections by their field names
function compareCollectionFields(localData: any, remoteData: any): boolean {
  const localFields = (localData.fields || []).map((f: any) => f.field).sort();
  const remoteFields = (remoteData.fields || []).map((f: any) => f.field).sort();
  return JSON.stringify(localFields) === JSON.stringify(remoteFields);
}

// Helper function to compare local and remote items
function compareItems(
  localItems: { id: string; name: string; data: any }[],
  remoteItems: { id: string; name: string; data: any }[],
  type: 'collection' | 'flow' | 'role' | 'policy'
): any[] {
  const result: any[] = [];
  const localMap = new Map(localItems.map((i) => [i.id, i]));
  const remoteMap = new Map(remoteItems.map((i) => [i.id, i]));

  // Check local items
  for (const local of localItems) {
    const remote = remoteMap.get(local.id);
    if (!remote) {
      result.push({
        id: `${type === 'collection' ? 'collection' : type}:${local.id}`,
        name: local.name,
        type,
        localStatus: 'exists',
        remoteStatus: 'missing',
        comparison: 'local-only',
        localData: local.data,
      });
    } else {
      // Both exist - compare based on type
      let isDifferent: boolean;

      if (type === 'collection') {
        // For collections, compare field names
        isDifferent = !compareCollectionFields(local.data, remote.data);
      } else {
        // For other types, compare normalized data
        const normalizedLocal = normalizeForComparison(local.data, type);
        const normalizedRemote = normalizeForComparison(remote.data, type);
        isDifferent = JSON.stringify(normalizedLocal) !== JSON.stringify(normalizedRemote);
      }

      result.push({
        id: `${type === 'collection' ? 'collection' : type}:${local.id}`,
        name: local.name,
        type,
        localStatus: 'exists',
        remoteStatus: 'exists',
        comparison: isDifferent ? 'different' : 'identical',
        localData: local.data,
        remoteData: remote.data,
      });
    }
  }

  // Check remote-only items
  for (const remote of remoteItems) {
    if (!localMap.has(remote.id)) {
      result.push({
        id: `${type === 'collection' ? 'collection' : type}:${remote.id}`,
        name: remote.name,
        type,
        localStatus: 'missing',
        remoteStatus: 'exists',
        comparison: 'remote-only',
        remoteData: remote.data,
      });
    }
  }

  return result;
}
