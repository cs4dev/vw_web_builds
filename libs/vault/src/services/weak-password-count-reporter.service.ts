import { Injectable } from "@angular/core";
import { firstValueFrom } from "rxjs";

import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { OrganizationService } from "@bitwarden/common/admin-console/abstractions/organization/organization.service.abstraction";
import { Organization } from "@bitwarden/common/admin-console/models/domain/organization";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { getUserId } from "@bitwarden/common/auth/services/account.service";
import { PasswordStrengthServiceAbstraction } from "@bitwarden/common/tools/password-strength";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { CipherType } from "@bitwarden/common/vault/enums";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";

export interface WeakPasswordReport {
  userId: string;
  organizationIds: string[];
  weakPasswordCount: number;
  totalPasswordCount: number;
  timestamp: string;
}

@Injectable({
  providedIn: "root",
})
export class WeakPasswordCountReporterService {
  private isReporting = false;
  private reportingDelay = 3000; // 3 seconds after decryption

  constructor(
    private cipherService: CipherService,
    private apiService: ApiService,
    private passwordStrengthService: PasswordStrengthServiceAbstraction,
    private accountService: AccountService,
    private organizationService: OrganizationService,
  ) {
    // Initialize background reporting asynchronously
    this.initializeBackgroundReporting().catch((error) => {});
  }

  private async initializeBackgroundReporting(): Promise<void> {
    // Listen for cipher decryption events
    const activeUserId = await firstValueFrom(this.accountService.activeAccount$.pipe(getUserId));
    this.cipherService.cipherViews$(activeUserId).subscribe((cipherViews: CipherView[] | null) => {
      if (cipherViews && cipherViews.length > 0 && !this.isReporting) {
        this.scheduleReport();
      }
    });
  }

  private scheduleReport(): void {
    if (this.isReporting) {return;}

    this.isReporting = true;
    setTimeout(async () => {
      await this.reportWeakPasswordCounts();
      this.isReporting = false;
    }, this.reportingDelay);
  }

  async reportWeakPasswordCounts(): Promise<void> {
    const report = await this.generateWeakPasswordReport();
    await this.sendReport(report);
  }

  private async generateWeakPasswordReport(): Promise<WeakPasswordReport> {
    const activeUserId = await firstValueFrom(this.accountService.activeAccount$.pipe(getUserId));
    const allCiphers = await this.cipherService.getAllDecrypted(activeUserId);

    const organizations = await firstValueFrom(
      this.organizationService.organizations$(activeUserId),
    );
    const organizationIds = organizations ? organizations.map((org: Organization) => org.id) : [];

    let weakPasswordCount = 0;
    let totalPasswordCount = 0;

    for (const cipher of allCiphers) {
      if (this.isPasswordCipher(cipher)) {
        totalPasswordCount++;
        if (this.isWeakPassword(cipher)) {
          weakPasswordCount++;
        }
      }
    }

    return {
      userId: activeUserId,
      organizationIds: organizationIds,
      weakPasswordCount: weakPasswordCount,
      totalPasswordCount: totalPasswordCount,
      timestamp: new Date().toISOString(),
    };
  }

  private isPasswordCipher(cipher: CipherView): boolean {
    return (
      cipher.type === CipherType.Login &&
      cipher.login?.password != null &&
      cipher.login.password !== "" &&
      !cipher.isDeleted &&
      cipher.viewPassword
    );
  }

  private isWeakPassword(cipher: CipherView): boolean {
    if (!this.isPasswordCipher(cipher)) {
      return false;
    }

    // Extract user input for password strength analysis
    let userInput: string[] = [];
    if (cipher.login.username) {
      const atPosition = cipher.login.username.indexOf("@");
      if (atPosition > -1) {
        userInput = cipher.login.username
          .substring(0, atPosition)
          .trim()
          .toLowerCase()
          .split(/[^A-Za-z0-9]/)
          .filter((i) => i.length >= 3);
      } else {
        userInput = cipher.login.username
          .trim()
          .toLowerCase()
          .split(/[^A-Za-z0-9]/)
          .filter((i) => i.length >= 3);
      }
    }

    const passwordStrength = this.passwordStrengthService.getPasswordStrength(
      cipher.login.password,
      null,
      userInput.length > 0 ? userInput : null,
    );

    // Consider passwords with score <= 2 as weak
    return passwordStrength.score != null && passwordStrength.score <= 2;
  }

  private async sendReport(report: WeakPasswordReport): Promise<void> {
    await this.apiService.send(
      "POST",
      "/custom/report",
      report,
      true, // authenticated
      false, // no response expected
    );
  }
}
