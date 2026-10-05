import { cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';

import { ThemeProvider } from '../../../theme/theme-provider';

// Stub the mutation hook so the sheet renders without the Supabase client. The
// mock lets each test drive success/error via the options callbacks.
let mockIsPending = false;
const mockMutate = jest.fn();
jest.mock('../use-reflection', () => ({
  useSubmitReflection: () => ({ mutate: mockMutate, isPending: mockIsPending }),
  mapReflectionError: (error: unknown) =>
    (error as { message?: string })?.message === 'reflection_exists'
      ? "You've already reflected on this trade."
      : "We couldn't save your reflection. Please try again.",
}));

// eslint-disable-next-line import/first -- jest.mock must be hoisted above this import
import { ReflectionSheet } from './reflection-sheet';

type View = Awaited<ReturnType<typeof render>>;

async function renderSheet(ui: React.ReactElement): Promise<View> {
  return await render(<ThemeProvider>{ui}</ThemeProvider>);
}

/** Whether the Save button is currently disabled (true until a choice is made). */
function saveIsDisabled(view: View): boolean {
  return view.getByLabelText('Save reflection').props.accessibilityState.disabled;
}

beforeEach(() => {
  mockMutate.mockReset();
  mockIsPending = false;
});

afterEach(() => {
  cleanup();
});

describe('<ReflectionSheet />', () => {
  it('asks the better/as expected/worse prompt with the three choices (9.2)', async () => {
    const view = await renderSheet(<ReflectionSheet orderId="o1" symbol="AAPL" onDone={jest.fn()} />);
    expect(view.getByText('How did it go?')).toBeTruthy();
    expect(view.getByText(/did it go better, as expected, or worse/i)).toBeTruthy();
    expect(view.getByText('Better')).toBeTruthy();
    expect(view.getByText('As expected')).toBeTruthy();
    expect(view.getByText('Worse')).toBeTruthy();
    // The optional note is offered and flagged as private to the learner (9.3).
    expect(view.getByLabelText(/optional note about how the trade went/i)).toBeTruthy();
    expect(view.getByText(/only you can see this/i)).toBeTruthy();
  });

  it('submits the chosen expectation through the mutation (null note when untyped)', async () => {
    const view = await renderSheet(<ReflectionSheet orderId="o1" symbol="AAPL" onDone={jest.fn()} />);

    fireEvent.press(view.getByText('Worse'));
    // The choice enables submit; wait for that before pressing save.
    await waitFor(() => expect(saveIsDisabled(view)).toBe(false));
    fireEvent.press(view.getByLabelText('Save reflection'));

    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate.mock.calls[0][0]).toEqual({
      orderId: 'o1',
      expectation: 'worse',
      note: null,
    });
  });

  it('does not submit until an expectation is chosen', async () => {
    const view = await renderSheet(<ReflectionSheet orderId="o1" symbol="AAPL" onDone={jest.fn()} />);
    // Save is disabled until a choice is made, so pressing it fires nothing.
    expect(saveIsDisabled(view)).toBe(true);
    fireEvent.press(view.getByLabelText('Save reflection'));
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('calls onDone when the learner skips', async () => {
    const onDone = jest.fn();
    const view = await renderSheet(<ReflectionSheet orderId="o1" symbol="AAPL" onDone={onDone} />);
    fireEvent.press(view.getByLabelText('Skip reflection'));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('calls onDone on a successful submit', async () => {
    mockMutate.mockImplementation((_input, opts) => opts.onSuccess?.());
    const onDone = jest.fn();
    const view = await renderSheet(<ReflectionSheet orderId="o1" symbol="AAPL" onDone={onDone} />);

    fireEvent.press(view.getByText('As expected'));
    await waitFor(() => expect(saveIsDisabled(view)).toBe(false));
    fireEvent.press(view.getByLabelText('Save reflection'));

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('shows friendly error copy and stays open on a failed submit', async () => {
    mockMutate.mockImplementation((_input, opts) =>
      opts.onError?.({ message: 'reflection_exists' }),
    );
    const onDone = jest.fn();
    const view = await renderSheet(<ReflectionSheet orderId="o1" symbol="AAPL" onDone={onDone} />);

    fireEvent.press(view.getByText('Better'));
    await waitFor(() => expect(saveIsDisabled(view)).toBe(false));
    fireEvent.press(view.getByLabelText('Save reflection'));

    expect(await view.findByText("You've already reflected on this trade.")).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });
});
