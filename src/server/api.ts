import { createHandler } from './router';
import { authRoutes } from './modules/auth';
import { meRoutes } from './modules/me';
import { eventRoutes } from './modules/events';
import { socialRoutes } from './modules/social';
import { chatRoutes } from './modules/chat';
import { businessRoutes } from './modules/business';
import { systemRoutes } from './modules/system';

export const routes = [...authRoutes, ...meRoutes, ...eventRoutes, ...socialRoutes, ...chatRoutes, ...businessRoutes, ...systemRoutes];
export const handle = createHandler(routes);
