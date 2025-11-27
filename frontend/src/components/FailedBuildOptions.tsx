import { Card, CardBody, Button } from '@heroui/react';

interface FailedBuildOptionsProps {
  onRevisePreferences: () => void;
  onTryAgain: () => void;
  errorMessage?: string;
}

export default function FailedBuildOptions({
  onRevisePreferences,
  onTryAgain,
  errorMessage
}: FailedBuildOptionsProps) {
  return (
    <div className="w-full max-w-2xl mx-auto mt-6 mb-4">
      <Card className="border border-red-200 bg-red-50">
        <CardBody className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-red-900 mb-1">
              Build failed
            </h3>
            {errorMessage && (
              <p className="text-sm text-red-700">{errorMessage}</p>
            )}
          </div>

          <p className="text-sm text-gray-700">
            What would you like to do?
          </p>

          <div className="flex gap-3 justify-center">
            <Button
              variant="bordered"
              onClick={onRevisePreferences}
              className="flex-1 max-w-xs"
            >
              Revise Preferences
            </Button>
            <Button
              color="primary"
              onClick={onTryAgain}
              className="flex-1 max-w-xs"
            >
              Try Again
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
