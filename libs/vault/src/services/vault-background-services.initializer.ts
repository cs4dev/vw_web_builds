import { Injectable } from "@angular/core";

import { WeakPasswordCountReporterService } from "./weak-password-count-reporter.service";

/**
 * Initialize background vault services
 * Add this to your app's providers to start background services
 */
@Injectable()
export class VaultBackgroundServicesInitializer {
  constructor(private weakPasswordReporter: WeakPasswordCountReporterService) {}
}

/**
 * Factory function for APP_INITIALIZER
 */
export function initializeVaultBackgroundServices(initializer: VaultBackgroundServicesInitializer) {
  return () => {
    // The constructor already does the initialization
    return Promise.resolve();
  };
}

/*
Usage in your app module:

import { APP_INITIALIZER } from '@angular/core';
import { 
  VaultBackgroundServicesInitializer, 
  initializeVaultBackgroundServices 
} from '@bitwarden/vault';

@NgModule({
  providers: [
    VaultBackgroundServicesInitializer,
    {
      provide: APP_INITIALIZER,
      useFactory: initializeVaultBackgroundServices,
      deps: [VaultBackgroundServicesInitializer],
      multi: true,
    },
  ],
})
export class AppModule {}
*/
