import type { ReactElement } from 'react'
import { AuthSlidingScreen } from '../../components/auth-sliding-screen'

export default function RegisterScreen(): ReactElement {
  return <AuthSlidingScreen initialTab="register" />
}
