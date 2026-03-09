import { buildLearningUrl, buildStartUrl, buildWatchUrl } from './api';
import { maskToken } from './preview';
import { getRandomIntInclusive, wait } from '../utils/helpers';

export type WatchPayload = {
  last_view_time: number;
  played: [[number, number]];
  learning_time: number;
};

export type QualifiedActivity = {
  id: string;
  name: string;
  duration: number;
};

export type WatchResponse = {
  activityId: string;
  activityName: string;
  duration: number;
  status: number | null;
  body: string;
  ok: boolean;
  error: string | null;
};

export type WatchBatchSummary = {
  total: number;
  successCount: number;
  failedCount: number;
  status: 'all-success' | 'partial-success' | 'all-failed';
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

export const buildPayload = (duration: number): WatchPayload => {
  const safeDuration = Math.max(0, Math.floor(duration));
  return {
    last_view_time: safeDuration,
    played: [[0, safeDuration]],
    learning_time: safeDuration,
  };
};

export const extractQualifiedActivities = (payload: unknown): QualifiedActivity[] => {
  if (!isRecord(payload)) {
    return [];
  }

  const data = payload.data;
  if (!isRecord(data)) {
    return [];
  }

  const units = data.units;
  if (!Array.isArray(units)) {
    return [];
  }

  const results: QualifiedActivity[] = [];
  const seenActivityIds = new Set<string>();

  for (const unit of units) {
    if (!isRecord(unit)) {
      continue;
    }

    const learningActivities = unit.learning_activities;
    if (!Array.isArray(learningActivities)) {
      continue;
    }

    for (const learningActivity of learningActivities) {
      if (!isRecord(learningActivity)) {
        continue;
      }

      const rawId = learningActivity.id;
      if (typeof rawId !== 'string' && typeof rawId !== 'number') {
        continue;
      }

      const activityId = String(rawId).trim();
      if (!activityId || seenActivityIds.has(activityId)) {
        continue;
      }

      const material = learningActivity.material;
      if (!isRecord(material)) {
        continue;
      }

      const rawDuration = material.duration;
      if (typeof rawDuration !== 'number' || !Number.isFinite(rawDuration) || rawDuration < 0) {
        continue;
      }

      const duration = Math.floor(rawDuration);
      const rawName = learningActivity.learning_activity_name;
      const activityName = typeof rawName === 'string' && rawName.trim().length > 0 ? rawName.trim() : `活動 ${activityId}`;

      seenActivityIds.add(activityId);
      results.push({ id: activityId, name: activityName, duration });
    }
  }

  return results;
};

type BuildRequestPreviewDataOptions = {
  apiBaseUrl: string;
  classId: string;
  authToken: string;
  eligibleActivities: QualifiedActivity[];
};

export const buildRequestPreviewData = ({
  apiBaseUrl,
  classId,
  authToken,
  eligibleActivities,
}: BuildRequestPreviewDataOptions) => {
  const startAndWatchPreviewEntries =
    eligibleActivities.length > 0
      ? eligibleActivities.map((activity) => ({
          activity_id: activity.id,
          step2_post_start: {
            method: 'POST',
            url: buildStartUrl(apiBaseUrl, classId, activity.id),
            headers: {
              Accept: 'application/json',
              Authorization: `Bearer ${maskToken(authToken)}`,
            },
          },
          step3_post_watch: {
            method: 'POST',
            url: buildWatchUrl(apiBaseUrl, classId, activity.id),
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              Authorization: `Bearer ${maskToken(authToken)}`,
            },
            body: buildPayload(activity.duration),
          },
        }))
      : [
          {
            activity_id: '{learningActivityId}',
            step2_post_start: {
              method: 'POST',
              url: buildStartUrl(apiBaseUrl, classId, '', true),
              headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${maskToken(authToken)}`,
              },
            },
            step3_post_watch: {
              method: 'POST',
              url: buildWatchUrl(apiBaseUrl, classId, '', true),
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Authorization: `Bearer ${maskToken(authToken)}`,
              },
              body: {
                last_view_time: 'material.duration',
                played: [[0, 'material.duration']],
                learning_time: 'material.duration',
              },
            },
          },
        ];

  return {
    step1_get_learning: {
      method: 'GET',
      url: buildLearningUrl(apiBaseUrl, classId, true),
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${maskToken(authToken)}`,
      },
    },
    step2_post_start_then_watch_requests: startAndWatchPreviewEntries,
  };
};

type RunWatchBatchOptions = {
  apiBaseUrl: string;
  classId: string;
  authToken: string;
  activities: QualifiedActivity[];
  intervalMinMs: number;
  intervalMaxMs: number;
  fetchImpl?: typeof fetch;
  waitFn?: (ms: number) => Promise<void>;
  randomIntInclusiveFn?: (min: number, max: number) => number;
};

type WatchBatchResult = {
  responses: WatchResponse[];
  summary: WatchBatchSummary;
  successMessage: string;
};

export const runWatchBatch = async ({
  apiBaseUrl,
  classId,
  authToken,
  activities,
  intervalMinMs,
  intervalMaxMs,
  fetchImpl = fetch,
  waitFn = wait,
  randomIntInclusiveFn = getRandomIntInclusive,
}: RunWatchBatchOptions): Promise<WatchBatchResult> => {
  const results: WatchResponse[] = [];

  for (const [index, activity] of activities.entries()) {
    const startEndpoint = buildStartUrl(apiBaseUrl, classId, activity.id);
    const watchEndpoint = buildWatchUrl(apiBaseUrl, classId, activity.id);

    if (index > 0) {
      const intervalMs = randomIntInclusiveFn(intervalMinMs, intervalMaxMs);
      await waitFn(intervalMs);
    }

    let startResponseStatus: number | null = null;
    let startResponseBody = '';

    try {
      const startResponse = await fetchImpl(startEndpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
      });

      startResponseStatus = startResponse.status;
      startResponseBody = await startResponse.text();

      if (!startResponse.ok) {
        results.push({
          activityId: activity.id,
          activityName: activity.name,
          duration: activity.duration,
          status: startResponseStatus,
          body: startResponseBody,
          ok: false,
          error: `start request 失敗（HTTP ${startResponseStatus}），已略過 watch。`,
        });
        continue;
      }
    } catch (error: unknown) {
      results.push({
        activityId: activity.id,
        activityName: activity.name,
        duration: activity.duration,
        status: startResponseStatus,
        body: startResponseBody,
        ok: false,
        error: `start request 發生錯誤，已略過 watch。${error instanceof Error ? error.message : '未知錯誤'}`,
      });
      continue;
    }

    try {
      const response = await fetchImpl(watchEndpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(buildPayload(activity.duration)),
      });

      const responseText = await response.text();
      results.push({
        activityId: activity.id,
        activityName: activity.name,
        duration: activity.duration,
        status: response.status,
        body: responseText,
        ok: response.ok,
        error: null,
      });
    } catch (error: unknown) {
      results.push({
        activityId: activity.id,
        activityName: activity.name,
        duration: activity.duration,
        status: null,
        body: '',
        ok: false,
        error: error instanceof Error ? error.message : '未知錯誤',
      });
    }
  }

  const successCount = results.filter((result) => result.ok).length;
  const failedCount = results.length - successCount;
  const summary: WatchBatchSummary = {
    total: results.length,
    successCount,
    failedCount,
    status: failedCount === 0 ? 'all-success' : successCount === 0 ? 'all-failed' : 'partial-success',
  };

  return {
    responses: results,
    summary,
    successMessage: failedCount === 0 ? `已完成送出，共 ${successCount} 筆 watch request 全部成功。` : '',
  };
};
