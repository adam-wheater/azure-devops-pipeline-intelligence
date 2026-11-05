import { BaseDataService } from "./BaseDataService";
import { PipelineSettings, DEFAULT_PIPELINE_SETTINGS } from "@/models/interfaces";
import { TestHealthSettings, DEFAULT_TEST_SETTINGS } from "@/models/testInterfaces";

const PIPELINE_SETTINGS_COLLECTION = "pipeline-intelligence-settings";
const PIPELINE_SETTINGS_ID = "pipeline-settings";
const TEST_SETTINGS_COLLECTION = "pipeline-intelligence-settings";
const TEST_SETTINGS_ID = "test-health-settings";

export class SettingsService extends BaseDataService {
  async getPipelineSettings(): Promise<PipelineSettings> {
    try {
      const manager = await this.getDataManager();
      const doc = await manager.getDocument(PIPELINE_SETTINGS_COLLECTION, PIPELINE_SETTINGS_ID);
      return {
        timePeriodDays: doc.timePeriodDays ?? DEFAULT_PIPELINE_SETTINGS.timePeriodDays,
        excludedDefinitionIds:
          doc.excludedDefinitionIds ?? DEFAULT_PIPELINE_SETTINGS.excludedDefinitionIds,
        costPerMinute: doc.costPerMinute ?? DEFAULT_PIPELINE_SETTINGS.costPerMinute,
        queueWaitWarningSeconds:
          doc.queueWaitWarningSeconds ?? DEFAULT_PIPELINE_SETTINGS.queueWaitWarningSeconds,
      };
    } catch {
      return { ...DEFAULT_PIPELINE_SETTINGS };
    }
  }

  async savePipelineSettings(settings: PipelineSettings): Promise<void> {
    const manager = await this.getDataManager();
    await manager.setDocument(PIPELINE_SETTINGS_COLLECTION, {
      id: PIPELINE_SETTINGS_ID,
      ...settings,
    });
  }

  async getTestHealthSettings(): Promise<TestHealthSettings> {
    try {
      const manager = await this.getDataManager();
      const doc = await manager.getDocument(TEST_SETTINGS_COLLECTION, TEST_SETTINGS_ID);
      return {
        flakyWindowSize: doc.flakyWindowSize ?? DEFAULT_TEST_SETTINGS.flakyWindowSize,
        slowTestThresholdMs: doc.slowTestThresholdMs ?? DEFAULT_TEST_SETTINGS.slowTestThresholdMs,
        timePeriodDays: doc.timePeriodDays ?? DEFAULT_TEST_SETTINGS.timePeriodDays,
      };
    } catch {
      return { ...DEFAULT_TEST_SETTINGS };
    }
  }

  async saveTestHealthSettings(settings: TestHealthSettings): Promise<void> {
    const manager = await this.getDataManager();
    await manager.setDocument(TEST_SETTINGS_COLLECTION, {
      id: TEST_SETTINGS_ID,
      ...settings,
    });
  }
}
