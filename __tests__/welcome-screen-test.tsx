import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import WelcomeScreen from '../app/(auth)/welcome';
import { ThemeProvider } from '../src/theme/theme-provider';

function renderScreen(ui: React.ReactElement) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>,
  );
}

// The screen reads login() from the session hook; mock it so no Auth0 native
// module loads and we can assert both CTAs trigger login.
const mockLogin = jest.fn().mockResolvedValue(undefined);
jest.mock('../src/lib/auth0', () => ({
  useSession: () => ({ login: mockLogin }),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('<WelcomeScreen />', () => {
  it('shows distinct Sign up and Log in buttons', async () => {
    const view = await renderScreen(<WelcomeScreen />);
    expect(view.getByText('Welcome to Masari')).toBeTruthy();
    expect(view.getByText('Sign up')).toBeTruthy();
    expect(view.getByText('Log in')).toBeTruthy();
    // The old single CTA label is gone.
    expect(view.queryByText('Get started')).toBeNull();
  });

  it('starts Auth0 login from the Sign up button', async () => {
    const view = await renderScreen(<WelcomeScreen />);
    fireEvent.press(view.getByText('Sign up'));
    await waitFor(() => expect(mockLogin).toHaveBeenCalledTimes(1));
  });

  it('starts Auth0 login from the Log in button', async () => {
    const view = await renderScreen(<WelcomeScreen />);
    fireEvent.press(view.getByText('Log in'));
    await waitFor(() => expect(mockLogin).toHaveBeenCalledTimes(1));
  });
});
