import { WebController } from './modules/express/types';
import { AuthController } from './web/controllers/auth';
import { PortfolioController } from './web/controllers/portfolio';
import { AssetController } from './web/controllers/asset';
import { TransactionController } from './web/controllers/transaction';
import { SipController } from './web/controllers/sip';
import { AlertController } from './web/controllers/alert';
import { MarketController } from './web/controllers/market';
import { ImportExportController } from './web/controllers/import-export';
import { TelegramController } from './web/controllers/telegram';
import { HealthController } from './web/controllers/health';

export const RoutesConfig = (): WebController[] => [
  new AuthController(),
  new PortfolioController(),
  new AssetController(),
  new TransactionController(),
  new SipController(),
  new AlertController(),
  new MarketController(),
  new ImportExportController(),
  new TelegramController(),
  new HealthController(),
];
