// Business logic for API endpoints
export const buildLearningUrl = (API_BASE_URL: string, classIdValue: string, withPlaceholders = false): string => {
  const classIdPath = classIdValue.trim()
    ? encodeURIComponent(classIdValue.trim())
    : withPlaceholders
      ? '{classId}'
      : '';
  return `${API_BASE_URL}/class/${classIdPath}/learning`;
};

export const buildWatchUrl = (API_BASE_URL: string, classIdValue: string, activityIdValue: string, withPlaceholders = false): string => {
  const classIdPath = classIdValue.trim()
    ? encodeURIComponent(classIdValue.trim())
    : withPlaceholders
      ? '{classId}'
      : '';
  const activityIdPath = activityIdValue.trim()
    ? encodeURIComponent(activityIdValue.trim())
    : withPlaceholders
      ? '{activityId}'
      : '';
  return `${API_BASE_URL}/class/${classIdPath}/learning-activity/${activityIdPath}/watch`;
};

export const buildStartUrl = (API_BASE_URL: string, classIdValue: string, activityIdValue: string, withPlaceholders = false): string => {
  const classIdPath = classIdValue.trim()
    ? encodeURIComponent(classIdValue.trim())
    : withPlaceholders
      ? '{classId}'
      : '';
  const activityIdPath = activityIdValue.trim()
    ? encodeURIComponent(activityIdValue.trim())
    : withPlaceholders
      ? '{activityId}'
      : '';
  return `${API_BASE_URL}/class/${classIdPath}/learning-activity/${activityIdPath}/start`;
};
