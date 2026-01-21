import { defineModule } from '@directus/extensions-sdk';
import ModuleComponent from './module.vue';

export default defineModule({
  id: 'sync',
  name: 'Sync',
  icon: 'sync',
  routes: [
    {
      path: '',
      component: ModuleComponent,
    },
  ],
});
