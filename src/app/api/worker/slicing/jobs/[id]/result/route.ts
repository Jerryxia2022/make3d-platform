import { openDatabase } from "../../../../../../../backend/database.ts";
import { authenticateSlicingWorkerRequest } from "../../../../../../../backend/workerSlicingAuth.ts";
import {
  authErrorResponse,
  CodedValidationError,
  jsonError,
  jsonOk,
  normalizeResultPayload,
  readJobId,
  readLimitedJsonBody,
  RESULT_BODY_LIMIT_BYTES,
  stableJson,
  ValidationError,
} from "../../../../../../../backend/workerSlicingApi.ts";
import {
  completeSlicingJobResult,
  getSlicingJobAttemptByLockOwner,
  getSlicingJobById,
} from "../../../../../../../backend/workerSlicingJobs.ts";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = authenticateSlicingWorkerRequest(request);
  if (!auth.ok) return authErrorResponse(auth);
  const id = readJobId((await params).id);
  if (!id) return jsonError(400, "INVALID_JOB_ID", "Invalid job id");

  const body = await readLimitedJsonBody(request, RESULT_BODY_LIMIT_BYTES);
  if (!body.ok) return body.response;

  const db = openDatabase();
  try {
    const job = getSlicingJobById(db, id);
    if (job.inputWorkerId !== auth.context.workerId) return jsonError(404, "JOB_NOT_FOUND", "Job not found");

    const normalized = normalizeResultPayload(body.body, job);

    if (job.status === "completed" || job.status === "partial") {
      const attempt = getSlicingJobAttemptByLockOwner(db, normalized.lockOwner);
      if (attempt.slicingJobId !== id || attempt.workerId !== auth.context.workerId) {
        return jsonError(404, "JOB_NOT_FOUND", "Job not found");
      }
      if (storedResultJson(job) !== normalized.normalizedJson) {
        return jsonError(409, "IDEMPOTENCY_PAYLOAD_CONFLICT", "Result payload conflicts with terminal result");
      }
      return jsonOk({
        job_id: id,
        status: job.status,
        parser_quote_ready: job.parserQuoteReady,
        parse_cache_key_sha256: job.parseCacheKeySha256,
      });
    }

    const completed = completeSlicingJobResult(db, {
      id,
      workerId: auth.context.workerId,
      lockOwner: normalized.lockOwner,
      actualParserVersion: job.requiredParserVersion,
      parseStatus: normalized.parseStatus,
      metricsStatus: normalized.metricsStatus,
      parserQuoteReady: normalized.serverParserQuoteReady,
      gcodeSha256: normalized.gcodeSha256,
      printTimeSeconds: normalized.metrics.print_time_seconds as number | null,
      silentPrintTimeSeconds: normalized.metrics.silent_print_time_seconds as number | null,
      filamentLengthMicrons: normalized.metrics.filament_length_microns as number | null,
      filamentVolumeMm3: normalized.metrics.filament_volume_mm3 as number | null,
      filamentWeightMg: normalized.metrics.filament_weight_mg as number | null,
      layerCount: normalized.metrics.layer_count as number | null,
      maxLayerZMicrons: normalized.metrics.max_layer_z_microns as number | null,
      filamentType: normalized.metrics.filament_type as string | null,
      printerModel: normalized.metrics.printer_model as string | null,
      nozzleDiameterMicrons: normalized.metrics.nozzle_diameter_microns as number | null,
      layerHeightMicrons: normalized.metrics.layer_height_microns as number | null,
      metricSourcesJson: stableJson(normalized.metricSources),
      metricValidationJson: stableJson(normalized.metricValidation),
      missingFieldsJson: stableJson(normalized.missingFields),
      warningsJson: stableJson(normalized.warnings),
    });

    if (!completed) return jsonError(409, "STATE_CONFLICT", "Job state does not allow result");
    return jsonOk({
      job_id: id,
      status: completed.status,
      parser_quote_ready: completed.parserQuoteReady,
      parse_cache_key_sha256: completed.parseCacheKeySha256,
    });
  } catch (error) {
    if (error instanceof CodedValidationError) return jsonError(422, error.code, error.message);
    if (error instanceof ValidationError) return jsonError(422, "VALIDATION_ERROR", error.message);
    throw error;
  } finally {
    db.close();
  }
}

function storedResultJson(job: ReturnType<typeof getSlicingJobById>) {
  return stableJson({
    gcode_sha256: job.gcodeSha256,
    parse_cache_key_sha256: job.parseCacheKeySha256,
    parse_status: job.parseStatus,
    metrics_status: job.metricsStatus,
    parser_quote_ready: job.parserQuoteReady,
    metrics: {
      print_time_seconds: job.printTimeSeconds,
      silent_print_time_seconds: job.silentPrintTimeSeconds,
      filament_length_microns: job.filamentLengthMicrons,
      filament_volume_mm3: job.filamentVolumeMm3,
      filament_weight_mg: job.filamentWeightMg,
      layer_count: job.layerCount,
      max_layer_z_microns: job.maxLayerZMicrons,
      filament_type: job.filamentType,
      printer_model: job.printerModel,
      nozzle_diameter_microns: job.nozzleDiameterMicrons,
      layer_height_microns: job.layerHeightMicrons,
      gcode_size_bytes: job.gcodeSizeBytes,
      gcode_sha256: job.gcodeSha256,
    },
    metric_sources: JSON.parse(job.metricSourcesJson || "{}"),
    metric_validation: JSON.parse(job.metricValidationJson || "{}"),
    missing_fields: JSON.parse(job.missingFieldsJson || "[]"),
    warnings: JSON.parse(job.warningsJson || "[]"),
  });
}
