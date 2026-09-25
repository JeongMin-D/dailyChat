import { jobRunReproducibilityContract } from "../../../packages/contracts/src/index.js";
import { prepareNightlyInput, selectNightlyTargetDay } from "./nightly-input.js";

const RUNNABLE_ACTIONS = new Set(["created", "resume", "in_progress"]);

function requireMethod(owner, name) {
  if (!owner || typeof owner[name] !== "function") {
    throw new TypeError(`${name}() is required`);
  }
}

export class NightlyPipelineRunner {
  constructor({
    inputStore,
    extractor,
    outputStore,
    notificationStore,
    notificationDelivery,
    pipelineVersion = "nightly-pipeline-v1",
    schemaVersion = jobRunReproducibilityContract.schemaVersions[0],
    provider = jobRunReproducibilityContract.provider,
    timeZone = "Asia/Seoul",
    boundaryHour = 4,
    logger = null
  }) {
    requireMethod(inputStore, "listUserMessagesForDay");
    requireMethod(extractor, "extract");
    requireMethod(outputStore, "prepareRun");
    requireMethod(outputStore, "claimRun");
    requireMethod(outputStore, "save");
    requireMethod(notificationStore, "enqueue");
    requireMethod(notificationDelivery, "deliver");
    if (typeof pipelineVersion !== "string" || pipelineVersion.length === 0) {
      throw new TypeError("pipelineVersion is required");
    }
    if (typeof extractor.model !== "string" || extractor.model.length === 0) {
      throw new TypeError("extractor.model is required");
    }
    if (typeof extractor.promptVersion !== "string" || extractor.promptVersion.length === 0) {
      throw new TypeError("extractor.promptVersion is required");
    }
    if (typeof provider !== "string" || provider.length === 0) {
      throw new TypeError("provider is required");
    }
    if (!jobRunReproducibilityContract.schemaVersions.includes(schemaVersion)) {
      throw new TypeError("schemaVersion is not supported");
    }
    if (!Number.isInteger(boundaryHour) || boundaryHour < 0 || boundaryHour > 23) {
      throw new RangeError("boundaryHour must be an integer from 0 to 23");
    }

    this.inputStore = inputStore;
    this.extractor = extractor;
    this.outputStore = outputStore;
    this.notificationStore = notificationStore;
    this.notificationDelivery = notificationDelivery;
    this.pipelineVersion = pipelineVersion;
    this.schemaVersion = schemaVersion;
    this.provider = provider;
    this.timeZone = timeZone;
    this.boundaryHour = boundaryHour;
    this.logger = logger;
  }

  /**
   * @param {{now?: Date, day?: string}} options
   */
  async run({ now = new Date(), day } = {}) {
    const targetDay = day ?? selectNightlyTargetDay(now, {
      timeZone: this.timeZone,
      boundaryHour: this.boundaryHour
    });
    const { snapshot, inputHash } = await prepareNightlyInput({
      day: targetDay,
      store: this.inputStore
    });

    if (snapshot.messages.length === 0) {
      this.logger?.info("nightly_pipeline_skipped", {
        day: targetDay,
        reason: "no_user_messages"
      });
      return { action: "skipped", day: targetDay, reason: "no_user_messages" };
    }

    const prepared = await this.outputStore.prepareRun({
      day: targetDay,
      pipelineVersion: this.pipelineVersion,
      inputHash,
      provider: this.provider,
      model: this.extractor.model,
      promptVersion: this.extractor.promptVersion,
      schemaVersion: this.schemaVersion
    });

    if (prepared.action === "noop") {
      const notification = await this.notificationStore.enqueue({
        jobRunId: prepared.jobRunId,
        diaryId: prepared.diaryId
      });
      const delivery = await this.notificationDelivery.deliver(notification.notificationId);
      this.logger?.info("nightly_pipeline_replayed", {
        day: targetDay,
        jobRunId: prepared.jobRunId,
        diaryId: prepared.diaryId,
        notificationId: notification.notificationId,
        deliveryAction: delivery.action
      });
      return {
        action: "noop",
        day: targetDay,
        jobRunId: prepared.jobRunId,
        diaryId: prepared.diaryId,
        diaryVersion: prepared.diaryVersion,
        notificationId: notification.notificationId,
        delivery
      };
    }

    if (!RUNNABLE_ACTIONS.has(prepared.action)) {
      this.logger?.info("nightly_pipeline_not_runnable", {
        day: targetDay,
        jobRunId: prepared.jobRunId,
        reason: prepared.action
      });
      return {
        action: "not_runnable",
        day: targetDay,
        jobRunId: prepared.jobRunId,
        reason: prepared.action
      };
    }

    const claimed = await this.outputStore.claimRun(prepared.jobRunId);
    if (!claimed) {
      this.logger?.info("nightly_pipeline_not_claimed", {
        day: targetDay,
        jobRunId: prepared.jobRunId
      });
      return {
        action: "not_claimed",
        day: targetDay,
        jobRunId: prepared.jobRunId
      };
    }

    const extraction = await this.extractor.extract({ snapshot });
    if (extraction.status !== "completed" || !extraction.output) {
      throw Object.assign(new Error("Nightly extraction did not produce an output"), {
        code: "NIGHTLY_EXTRACTION_NOT_COMPLETED"
      });
    }

    const saved = await this.outputStore.save({
      jobRunId: prepared.jobRunId,
      output: extraction.output,
      snapshot
    });
    const notification = await this.notificationStore.enqueue({
      jobRunId: prepared.jobRunId,
      diaryId: saved.diaryId
    });
    const delivery = await this.notificationDelivery.deliver(notification.notificationId);

    this.logger?.info("nightly_pipeline_completed", {
      day: targetDay,
      jobRunId: prepared.jobRunId,
      diaryId: saved.diaryId,
      diaryVersion: saved.diaryVersion,
      notificationId: notification.notificationId,
      deliveryAction: delivery.action,
      extractionAttempts: extraction.attempts
    });
    return {
      action: "completed",
      day: targetDay,
      jobRunId: prepared.jobRunId,
      diaryId: saved.diaryId,
      diaryVersion: saved.diaryVersion,
      notificationId: notification.notificationId,
      delivery,
      extractionAttempts: extraction.attempts
    };
  }
}
