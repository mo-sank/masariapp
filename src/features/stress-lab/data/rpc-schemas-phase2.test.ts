import {
  parseStressChallengeProgress,
  parseStressPrediction,
  parseStressReflection,
} from './rpc-schemas';

function predictionRow() {
  return {
    id: 'pred-1',
    simulation_id: 'sim-1',
    user_id: 'auth0|abc',
    direction: 'lose',
    estimated_change_bp: -2000,
    picked_best: 'KO',
    picked_worst: 'JPM',
    accuracy: {
      direction_correct: true,
      actual_direction: 'lose',
      actual_change_bp: -3583,
      estimate_error_bp: 1583,
      best_correct: true,
      worst_correct: false,
      actual_best: 'KO',
      actual_worst: 'XOM',
    },
    created_at: '2025-01-08T00:00:00.000Z',
  };
}

function reflectionRow() {
  return {
    id: 'ref-1',
    simulation_id: 'sim-1',
    user_id: 'auth0|abc',
    responses: [{ question: 'surprise', answer: 'Financials fell the most.' }],
    created_at: '2025-01-08T00:00:00.000Z',
  };
}

function challengeRow() {
  return {
    user_id: 'auth0|abc',
    scenario_id: 'recession',
    challenge_id: 'survive_recession',
    status: 'met',
    best_simulation_id: 'sim-1',
    attempts: 3,
    met_at: '2025-01-08T00:00:00.000Z',
    updated_at: '2025-01-08T00:00:00.000Z',
  };
}

describe('parseStressPrediction', () => {
  it('parses a scored prediction row', () => {
    const row = parseStressPrediction(predictionRow());
    expect(row.accuracy?.direction_correct).toBe(true);
    expect(row.accuracy?.estimate_error_bp).toBe(1583);
  });

  it('accepts a null accuracy and null optional fields', () => {
    const row = parseStressPrediction({
      ...predictionRow(),
      accuracy: null,
      estimated_change_bp: null,
      picked_best: null,
      picked_worst: null,
    });
    expect(row.accuracy).toBeNull();
    expect(row.picked_best).toBeNull();
  });

  it('rejects a non-integer estimate', () => {
    expect(() => parseStressPrediction({ ...predictionRow(), estimated_change_bp: 1.5 })).toThrow();
  });
});

describe('parseStressReflection', () => {
  it('parses a reflection row with an array of responses', () => {
    const row = parseStressReflection(reflectionRow());
    expect(row.responses).toHaveLength(1);
  });

  it('rejects a non-array responses field', () => {
    expect(() => parseStressReflection({ ...reflectionRow(), responses: 'oops' })).toThrow();
  });
});

describe('parseStressChallengeProgress', () => {
  it('parses a challenge-progress row', () => {
    const row = parseStressChallengeProgress(challengeRow());
    expect(row.status).toBe('met');
    expect(row.attempts).toBe(3);
  });

  it('accepts a null best_simulation_id and met_at', () => {
    const row = parseStressChallengeProgress({
      ...challengeRow(),
      best_simulation_id: null,
      met_at: null,
      status: 'in_progress',
    });
    expect(row.best_simulation_id).toBeNull();
    expect(row.met_at).toBeNull();
  });

  it('rejects a non-integer attempts', () => {
    expect(() => parseStressChallengeProgress({ ...challengeRow(), attempts: 'two' })).toThrow();
  });
});
