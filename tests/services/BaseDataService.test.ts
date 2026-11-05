import { __setMockService, __resetMockServices } from "../__mocks__/azure-devops-extension-sdk";
import { CommonServiceIds } from "azure-devops-extension-api";
import { BaseDataService } from "@/services/BaseDataService";

class Probe extends BaseDataService {
  manager() {
    return this.getDataManager();
  }
}

describe("BaseDataService", () => {
  afterEach(() => __resetMockServices());

  it("retries after a failed data-manager acquisition instead of caching the rejection", async () => {
    const getExtensionDataManager = jest
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce({ ok: true });
    __setMockService(CommonServiceIds.ExtensionDataService, { getExtensionDataManager });

    const probe = new Probe();
    await expect(probe.manager()).rejects.toThrow("transient");
    await expect(probe.manager()).resolves.toEqual({ ok: true });
    expect(getExtensionDataManager).toHaveBeenCalledTimes(2);
  });

  it("shares one data manager across calls once acquired", async () => {
    const getExtensionDataManager = jest.fn().mockResolvedValue({ ok: true });
    __setMockService(CommonServiceIds.ExtensionDataService, { getExtensionDataManager });

    const probe = new Probe();
    await probe.manager();
    await probe.manager();
    expect(getExtensionDataManager).toHaveBeenCalledTimes(1);
  });
});
