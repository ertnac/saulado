import type { ReactElement } from 'react'
import { AuthSlidingScreen } from '../../components/auth-sliding-screen'

export default function LoginScreen(): ReactElement {
  return <AuthSlidingScreen initialTab="login" />
}
