import { Card, CardBody, Input, Button, Code, Alert, Chip, Divider, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Accordion, AccordionItem } from '@heroui/react'
import { ApiService, type CustomDomainInfo, type TXTValidationRecord, CustomDomainStatus } from '../services/api'
import { useState, useEffect } from 'react'
import { Globe, Check, AlertCircle, Loader2, X, ExternalLink, Copy, CheckCheck, Info } from 'lucide-react'

interface CustomDomainSectionProps {
  projectId: string
  customDomain?: CustomDomainInfo
  onUpdate: () => void
}

export const CustomDomainSection = ({ projectId, customDomain, onUpdate }: CustomDomainSectionProps) => {
  const [domainInput, setDomainInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedValue, setCopiedValue] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)
  const [validationRecords, setValidationRecords] = useState<TXTValidationRecord[]>([])
  const [validationMessage, setValidationMessage] = useState<string | null>(null)

  // Sync validation records from prop when customDomain changes
  useEffect(() => {
    if (customDomain?.validationRecords && customDomain.validationRecords.length > 0) {
      setValidationRecords(customDomain.validationRecords)
      setValidationMessage(customDomain.validationMessage || null)
    } else {
      setValidationRecords([])
      setValidationMessage(null)
    }
  }, [customDomain])

  const handleSetCustomDomain = async () => {
    if (!domainInput.trim()) {
      setError('Please enter a domain')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      await ApiService.setCustomDomain(projectId, domainInput.trim())
      setDomainInput('')
      onUpdate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set custom domain')
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerifyDNS = async () => {
    setIsVerifying(true)
    setError(null)

    try {
      const result = await ApiService.verifyCustomDomainDNS(projectId)

      if (result.verified) {
        // Store validation records if present
        if (result.validationRecords && result.validationRecords.length > 0) {
          setValidationRecords(result.validationRecords)
          setValidationMessage(result.message || null)
        } else {
          setValidationRecords([])
          setValidationMessage(null)
        }
        onUpdate()
      } else {
        setError(result.error || 'DNS verification failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify DNS')
    } finally {
      setIsVerifying(false)
    }
  }

  const handleRemove = async () => {
    if (!confirm('Are you sure you want to remove the custom domain?')) {
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      await ApiService.removeCustomDomain(projectId)
      onUpdate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove custom domain')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCopyValue = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedValue(true)
      setTimeout(() => setCopiedValue(false), 2000)
    } catch (err) {
      console.error('Failed to copy to clipboard:', err)
    }
  }

  const getStatusChip = (status: CustomDomainStatus) => {
    switch (status) {
      case CustomDomainStatus.ACTIVE:
        return <Chip size="sm" color="success" startContent={<Check className="w-3 h-3" />}>Active</Chip>
      case CustomDomainStatus.PENDING_DNS:
        return <Chip size="sm" color="warning" startContent={<AlertCircle className="w-3 h-3" />}>Pending DNS</Chip>
      case CustomDomainStatus.PENDING_SSL:
        return <Chip size="sm" color="primary" startContent={<Loader2 className="w-3 h-3 animate-spin" />}>Pending SSL</Chip>
      case CustomDomainStatus.FAILED:
        return <Chip size="sm" color="danger" startContent={<X className="w-3 h-3" />}>Failed</Chip>
      default:
        return null
    }
  }

  if (!customDomain) {
    // No custom domain set - show input to add one
    return (
      <div className="space-y-3">
        <Divider className="my-4" />

        <div className="text-sm font-medium text-default-700 flex items-center gap-2">
          <Globe className="w-4 h-4" />
          Custom Domain (Optional)
        </div>

        <div className="text-xs text-default-500">
          Use your own domain for this project
        </div>

        <div className="flex gap-2">
          <Input
            size="sm"
            placeholder="www.example.com"
            value={domainInput}
            onChange={(e) => setDomainInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isLoading) {
                handleSetCustomDomain()
              }
            }}
            isDisabled={isLoading}
            classNames={{
              input: "text-sm"
            }}
          />
          <Button
            size="sm"
            color="primary"
            onPress={handleSetCustomDomain}
            isLoading={isLoading}
          >
            Add Domain
          </Button>
        </div>

        {error && (
          <Alert color="danger" variant="flat" className="text-xs">
            {error}
          </Alert>
        )}
      </div>
    )
  }

  // Custom domain is set - show status and instructions
  return (
    <div className="space-y-3">
      <Divider className="my-4" />

      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-default-700 flex items-center gap-2">
          <Globe className="w-4 h-4" />
          Custom Domain
        </div>
        {getStatusChip(customDomain.status)}
      </div>

      {/* Domain URL (if active) */}
      {customDomain.status === CustomDomainStatus.ACTIVE && customDomain.url && (
        <Card shadow="none" className="bg-success-50 border border-success-200">
          <CardBody className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-success-700">
                <Check className="w-4 h-4" />
                <a
                  href={customDomain.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium hover:underline flex items-center gap-1"
                >
                  {customDomain.domain}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* DNS Instructions */}
      {customDomain.dnsInstructions && (
        <Card shadow="none" className="bg-default-50">
          <CardBody className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium text-default-700">
                DNS Configuration
              </div>
              <button
                onClick={() => setShowInstructions(true)}
                className="p-1 hover:bg-default-200 rounded transition-colors"
                title="View DNS setup instructions"
              >
                <Info className="w-3.5 h-3.5 text-default-600" />
              </button>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-default-500">Type:</span>
                <Code size="sm" className="text-xs">{customDomain.dnsInstructions.type}</Code>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-default-500">Name:</span>
                <Code size="sm" className="text-xs">{customDomain.dnsInstructions.name}</Code>
              </div>
              <div className="flex justify-between items-center gap-2">
                <span className="text-default-500">Value:</span>
                <div className="flex items-center gap-1.5">
                  <Code size="sm" className="text-xs break-all">{customDomain.dnsInstructions.value}</Code>
                  <button
                    onClick={() => handleCopyValue(customDomain.dnsInstructions!.value)}
                    className="p-1 hover:bg-default-200 rounded transition-colors"
                    title="Copy to clipboard"
                  >
                    {copiedValue ? (
                      <CheckCheck className="w-3.5 h-3.5 text-success" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-default-600" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Status-specific messages and actions */}
      {customDomain.status === CustomDomainStatus.PENDING_DNS && (
        <Alert
          color="warning"
          variant="flat"
          title="DNS Not Configured"
          description="Point your DNS to the CNAME above"
          className="text-xs"
        >
          <div className="mt-2">
            <Button
              size="sm"
              color="warning"
              variant="flat"
              onPress={handleVerifyDNS}
              isLoading={isVerifying}
              startContent={!isVerifying ? <Check className="w-3 h-3" /> : undefined}
            >
              Check DNS
            </Button>
          </div>
        </Alert>
      )}

      {customDomain.status === CustomDomainStatus.PENDING_SSL && (
        <>
          {validationRecords.length > 0 ? (
            <Card shadow="none" className="bg-primary-50 border border-primary-200">
              <CardBody className="p-3 space-y-3">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-primary-600 mt-0.5 flex-shrink-0" />
                  <div className="space-y-2 flex-1">
                    <div className="text-xs font-medium text-primary-900">
                      TXT Records Required for SSL Validation
                    </div>
                    {validationMessage && (
                      <div className="text-xs text-primary-700">
                        {validationMessage}
                      </div>
                    )}
                  </div>
                </div>

                {validationRecords.map((record, index) => (
                  <div key={index} className="space-y-1.5 text-xs bg-white rounded p-2">
                    <div className="flex justify-between items-center">
                      <span className="text-default-500 font-medium">Type:</span>
                      <Code size="sm" className="text-xs">TXT</Code>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-default-500 font-medium">Name:</span>
                      <div className="flex items-center gap-1.5">
                        <Code size="sm" className="text-xs break-all">{record.txt_name}</Code>
                        <button
                          onClick={() => handleCopyValue(record.txt_name)}
                          className="p-1 hover:bg-default-200 rounded transition-colors"
                          title="Copy to clipboard"
                        >
                          {copiedValue ? (
                            <CheckCheck className="w-3.5 h-3.5 text-success" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-default-600" />
                          )}
                        </button>
                      </div>
                    </div>
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-default-500 font-medium">Value:</span>
                      <div className="flex items-center gap-1.5">
                        <Code size="sm" className="text-xs break-all max-w-[400px]">{record.txt_value}</Code>
                        <button
                          onClick={() => handleCopyValue(record.txt_value)}
                          className="p-1 hover:bg-default-200 rounded transition-colors"
                          title="Copy to clipboard"
                        >
                          {copiedValue ? (
                            <CheckCheck className="w-3.5 h-3.5 text-success" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-default-600" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                <Alert color="warning" variant="flat" className="text-xs">
                  Add these TXT records to your domain's DNS settings to complete SSL certificate validation. After adding, click "Check DNS" again to verify.
                </Alert>

                <div className="mt-2">
                  <Button
                    size="sm"
                    color="primary"
                    variant="flat"
                    onPress={handleVerifyDNS}
                    isLoading={isVerifying}
                    startContent={!isVerifying ? <Check className="w-3 h-3" /> : undefined}
                  >
                    Check DNS
                  </Button>
                </div>
              </CardBody>
            </Card>
          ) : (
            <Alert
              color="primary"
              variant="flat"
              title="SSL Provisioning"
              description="SSL certificate is being provisioned (30s - 2min)"
              className="text-xs"
            />
          )}
        </>
      )}

      {customDomain.status === CustomDomainStatus.FAILED && customDomain.error && (
        <Alert
          color="danger"
          variant="flat"
          title="Configuration Failed"
          description={customDomain.error}
          className="text-xs"
        >
          <div className="mt-2">
            <Button
              size="sm"
              color="danger"
              variant="flat"
              onPress={handleVerifyDNS}
              isLoading={isVerifying}
            >
              Retry Verification
            </Button>
          </div>
        </Alert>
      )}

      {error && (
        <Alert color="danger" variant="flat" className="text-xs">
          {error}
        </Alert>
      )}

      {/* Remove button - hidden during SSL provisioning */}
      {customDomain.status !== CustomDomainStatus.PENDING_SSL && (
        <div className="pt-2">
          <Button
            size="sm"
            color="danger"
            variant="light"
            onPress={handleRemove}
            isLoading={isLoading}
            startContent={<X className="w-3 h-3" />}
          >
            Remove Custom Domain
          </Button>
        </div>
      )}

      {/* DNS Instructions Modal */}
      <Modal isOpen={showInstructions} onOpenChange={setShowInstructions} size="lg">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>
                <h3 className="text-lg font-semibold">How to Add DNS Record</h3>
              </ModalHeader>
              <ModalBody className="gap-4">
                {/* Generic Instructions */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-default-700">General Instructions</h4>
                  <ol className="list-decimal list-inside space-y-2 text-sm text-default-600">
                    <li>Log in to your domain registrar's control panel (where you purchased your domain)</li>
                    <li>Navigate to the DNS settings or DNS management section</li>
                    <li>Look for an option to add a new DNS record or manage DNS records</li>
                    <li>Create a new CNAME record with these values:
                      <div className="ml-6 mt-2 space-y-1">
                        {customDomain?.dnsInstructions && (
                          <>
                            <div className="flex gap-2">
                              <span className="font-medium">Type:</span>
                              <Code size="sm">{customDomain.dnsInstructions.type}</Code>
                            </div>
                            <div className="flex gap-2">
                              <span className="font-medium">Name:</span>
                              <Code size="sm">{customDomain.dnsInstructions.name}</Code>
                            </div>
                            <div className="flex gap-2">
                              <span className="font-medium">Value:</span>
                              <Code size="sm">{customDomain.dnsInstructions.value}</Code>
                            </div>
                          </>
                        )}
                      </div>
                    </li>
                    <li>Save the DNS record</li>
                    <li>DNS changes can take 5 minutes to 48 hours to propagate (usually 15-30 minutes)</li>
                    <li>Return here and click "Check DNS" to verify your configuration</li>
                  </ol>
                </div>

                {/* Vendor-Specific Instructions */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-default-700">Provider-Specific Guides</h4>
                  <Accordion variant="bordered">
                    <AccordionItem
                      key="godaddy"
                      aria-label="GoDaddy Instructions"
                      title={<span className="text-sm font-medium">GoDaddy</span>}
                    >
                      <ol className="list-decimal list-inside space-y-2 text-sm text-default-600">
                        <li>Go to your <a href="https://dcc.godaddy.com/domains" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">GoDaddy Domain Portfolio</a></li>
                        <li>Click on your domain name to access Domain Settings</li>
                        <li>Scroll down to "Additional Settings" and click "Manage DNS"</li>
                        <li>In the DNS Management page, scroll to the "Records" section</li>
                        <li>Click the "Add" button to create a new record</li>
                        <li>Select "CNAME" from the Type dropdown</li>
                        <li>In the "Name" field, enter: <Code size="sm">{customDomain?.dnsInstructions?.name || '@'}</Code></li>
                        <li>In the "Value" field, enter: <Code size="sm">{customDomain?.dnsInstructions?.value || ''}</Code></li>
                        <li>Set TTL to "1 Hour" (or leave as default)</li>
                        <li>Click "Save" to add the record</li>
                      </ol>
                    </AccordionItem>
                    <AccordionItem
                      key="namecheap"
                      aria-label="Namecheap Instructions"
                      title={<span className="text-sm font-medium">Namecheap</span>}
                    >
                      <ol className="list-decimal list-inside space-y-2 text-sm text-default-600">
                        <li>Sign in to your <a href="https://www.namecheap.com/myaccount/login/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Namecheap account</a></li>
                        <li>Click on "Domain List" in the left sidebar</li>
                        <li>Click the "Manage" button next to your domain</li>
                        <li>Go to the "Advanced DNS" tab</li>
                        <li>Scroll to "Host Records" section</li>
                        <li>Click "Add New Record"</li>
                        <li>Select "CNAME Record" from the Type dropdown</li>
                        <li>In the "Host" field, enter: <Code size="sm">{customDomain?.dnsInstructions?.name || 'www'}</Code></li>
                        <li>In the "Target" field, enter: <Code size="sm">{customDomain?.dnsInstructions?.value || ''}</Code></li>
                        <li>Set TTL to "Automatic" (or leave as default)</li>
                        <li>Click the green checkmark to save the record</li>
                      </ol>
                    </AccordionItem>
                  </Accordion>
                </div>

                <Alert color="primary" variant="flat" className="text-xs">
                  <p>After adding the DNS record, it may take some time to propagate. You can use the "Check DNS" button to verify when it's ready.</p>
                </Alert>
              </ModalBody>
              <ModalFooter>
                <Button size="sm" color="primary" onPress={onClose}>
                  Got it
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  )
}
