import { Button, Divider } from '@heroui/react'
import { GoogleIcon } from '../icons/GoogleIcon'

interface GoogleSignInButtonProps {
  onPress: () => void
  loading?: boolean
  label?: string
}

export const GoogleSignInButton = ({
  onPress,
  loading = false,
  label = 'Continue with Google',
}: GoogleSignInButtonProps) => (
  <>
    <div className="flex items-center gap-4 my-4">
      <Divider className="flex-1" />
      <span className="text-small text-default-500">or</span>
      <Divider className="flex-1" />
    </div>
    <Button
      fullWidth
      variant="bordered"
      className="h-11 font-medium"
      startContent={!loading && <GoogleIcon className="w-5 h-5" />}
      onPress={onPress}
      isLoading={loading}
    >
      {label}
    </Button>
  </>
)
