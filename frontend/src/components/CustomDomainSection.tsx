import { Input, Button, Code, Alert, Chip, Divider, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Accordion, AccordionItem } from '@heroui/react'
import { ApiService, type CustomDomainInfo, CustomDomainStatus } from '../services/api'
import { useState } from 'react'
import { Globe, Check, Loader2, Copy, CheckCheck, Info, ArrowUpRight, ArrowRight, RefreshCw } from 'lucide-react'

interface CustomDomainSectionProps {
  projectId: string
  customDomain?: CustomDomainInfo
  onUpdate: () => void
  compact?: boolean
}

export const CustomDomainSection = ({ projectId, customDomain, onUpdate, compact }: CustomDomainSectionProps) => {
  const [domainInput, setDomainInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedValue, setCopiedValue] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)

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

  if (!customDomain) {
    // No custom domain set - show input to add one
    return (
      <div className="space-y-3">
        {!compact && (
          <>
            <Divider className="my-4" />
            <div className="text-sm font-medium text-default-700 flex items-center gap-2">
              <Globe className="w-4 h-4" />
              Custom Domain (Optional)
            </div>
          </>
        )}

        <div className="relative">
          <Input
            size="sm"
            placeholder="example.com"
            value={domainInput}
            onChange={(e) => setDomainInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isLoading) {
                handleSetCustomDomain()
              }
            }}
            isDisabled={isLoading}
            variant="bordered"
            radius="lg"
            classNames={{
              input: 'text-sm',
              inputWrapper: 'border-default-200 hover:border-default-300 h-10',
            }}
            endContent={
              <Button
                size="sm"
                variant="light"
                color="primary"
                onPress={handleSetCustomDomain}
                isLoading={isLoading}
                isIconOnly={!domainInput.trim()}
                className="min-w-fit h-7 px-2"
              >
                {domainInput.trim() ? (
                  <span className="flex items-center gap-1 text-xs">
                    Connect <ArrowRight className="w-3 h-3" />
                  </span>
                ) : (
                  <ArrowRight className="w-3.5 h-3.5" />
                )}
              </Button>
            }
          />
        </div>

        {error && (
          <p className="text-xs text-danger">{error}</p>
        )}
      </div>
    )
  }

  // Custom domain is set - show status and instructions
  return (
    <div className="space-y-3">
      {!compact && <Divider className="my-4" />}

      {/* Active domain — clickable link */}
      {customDomain.status === CustomDomainStatus.ACTIVE && customDomain.url && (
        <a
          href={customDomain.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center justify-between rounded-xl border border-default-200 hover:border-emerald-200 bg-default-50 hover:bg-emerald-50/30 px-3.5 py-3 transition-all duration-150"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="relative flex h-2 w-2 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-sm text-default-700 group-hover:text-emerald-700 truncate">
              {customDomain.domain}
            </span>
          </div>
          <ArrowUpRight className="w-4 h-4 text-default-300 group-hover:text-emerald-500 flex-shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </a>
      )}

      {/* Non-active states — show status header */}
      {customDomain.status !== CustomDomainStatus.ACTIVE && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-default-600 truncate">{customDomain.domain}</span>
          {customDomain.status === CustomDomainStatus.PENDING_DNS && (
            <Chip size="sm" variant="flat" color="warning" className="h-5 text-[10px]">Pending DNS</Chip>
          )}
          {customDomain.status === CustomDomainStatus.PENDING_SSL && (
            <Chip size="sm" variant="flat" color="primary" className="h-5 text-[10px]">
              <Loader2 className="w-2.5 h-2.5 animate-spin mr-1" />SSL
            </Chip>
          )}
          {customDomain.status === CustomDomainStatus.FAILED && (
            <Chip size="sm" variant="flat" color="danger" className="h-5 text-[10px]">Failed</Chip>
          )}
        </div>
      )}

      {/* DNS Instructions — only shown when DNS is pending */}
      {customDomain.dnsInstructions && customDomain.status === CustomDomainStatus.PENDING_DNS && (
        <div className="rounded-xl border border-default-200 bg-default-50/50 overflow-hidden">
          <div className="px-3 py-2 border-b border-default-100 flex items-center justify-between">
            <span className="text-[11px] font-medium text-default-500 uppercase tracking-wider">CNAME Record</span>
            <button
              onClick={() => setShowInstructions(true)}
              className="p-1 hover:bg-default-200 rounded-md transition-colors"
              title="View DNS setup instructions"
            >
              <Info className="w-3 h-3 text-default-400" />
            </button>
          </div>
          <div className="px-3 py-2.5 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-default-400">Name</span>
              <code className="text-default-600 bg-default-100 px-1.5 py-0.5 rounded text-[11px]">{customDomain.dnsInstructions.name}</code>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-default-400">Value</span>
              <div className="flex items-center gap-1">
                <code className="text-default-600 bg-default-100 px-1.5 py-0.5 rounded text-[11px] truncate max-w-[180px]">{customDomain.dnsInstructions.value}</code>
                <button
                  onClick={() => handleCopyValue(customDomain.dnsInstructions!.value)}
                  className="p-1 hover:bg-default-200 rounded-md transition-colors flex-shrink-0"
                  title="Copy to clipboard"
                >
                  {copiedValue ? (
                    <CheckCheck className="w-3 h-3 text-emerald-500" />
                  ) : (
                    <Copy className="w-3 h-3 text-default-400" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Status-specific actions */}
      {customDomain.status === CustomDomainStatus.PENDING_DNS && (
        <div className="space-y-2">
          <p className="text-xs text-default-400 leading-relaxed">
            Add the CNAME record above at your domain registrar, then verify.
          </p>
          <Button
            size="sm"
            variant="flat"
            color="primary"
            onPress={handleVerifyDNS}
            isLoading={isVerifying}
            fullWidth
            radius="lg"
            startContent={!isVerifying ? <Check className="w-3.5 h-3.5" /> : undefined}
          >
            Verify DNS
          </Button>
        </div>
      )}

      {customDomain.status === CustomDomainStatus.PENDING_SSL && (
        <div className="flex items-center gap-2 px-1">
          <Loader2 className="w-3 h-3 animate-spin text-primary" />
          <p className="text-xs text-default-400">SSL provisioning (30s - 2min)...</p>
        </div>
      )}

      {customDomain.status === CustomDomainStatus.FAILED && customDomain.error && (
        <div className="space-y-2">
          <p className="text-xs text-danger-500">{customDomain.error}</p>
          <Button
            size="sm"
            variant="flat"
            color="danger"
            onPress={handleVerifyDNS}
            isLoading={isVerifying}
            radius="lg"
            startContent={!isVerifying ? <RefreshCw className="w-3 h-3" /> : undefined}
          >
            Retry
          </Button>
        </div>
      )}

      {error && (
        <p className="text-xs text-danger">{error}</p>
      )}

      {/* Remove — subtle text link */}
      {customDomain.status !== CustomDomainStatus.PENDING_SSL && (
        <button
          onClick={handleRemove}
          disabled={isLoading}
          className="text-xs text-default-400 hover:text-danger transition-colors cursor-pointer disabled:opacity-50"
        >
          {isLoading ? 'Removing...' : 'Remove domain'}
        </button>
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
                    <li>Return here and click "Verify DNS" to verify your configuration</li>
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
                  <p>After adding the DNS record, it may take some time to propagate. You can use the "Verify DNS" button to verify when it's ready.</p>
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
