import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { 
  Key, 
  Search, 
  Trash2, 
  Plus, 
  User, 
  Package, 
  FileText, 
  CalendarDays, 
  Truck, 
  Activity,
  AlertCircle,
  Loader2
} from "lucide-react";

import {
  CommunityOwnershipInputRecordType,
  useLinkCommunityOwnership,
  useUnlinkCommunityOwnership,
  useListCommunityOwnerships,
  getListCommunityOwnershipsQueryKey,
  useListCommunityOwnershipCandidates,
  getListCommunityOwnershipCandidatesQueryKey,
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

// Define a schema for the ownership link form
const linkSchema = z.object({
  recordType: z.enum([
    "account",
    "donation",
    "claim",
    "appointment",
    "pickup_request",
    "service_activity",
  ]),
  recordId: z.string().min(1, "Record ID is required"),
});

type LinkFormValues = z.infer<typeof linkSchema>;

function getIconForRecordType(type: string) {
  switch (type) {
    case "account": return <User className="w-4 h-4" />;
    case "donation": return <Package className="w-4 h-4" />;
    case "claim": return <FileText className="w-4 h-4" />;
    case "appointment": return <CalendarDays className="w-4 h-4" />;
    case "pickup_request": return <Truck className="w-4 h-4" />;
    case "service_activity": return <Activity className="w-4 h-4" />;
    default: return <Key className="w-4 h-4" />;
  }
}

function getLabelForRecordType(type: string) {
  return type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

export default function CommunityOwnershipPage() {
  const [clerkUserId, setClerkUserId] = useState<string>("");
  const [searchInput, setSearchInput] = useState<string>("");
  const [recordSearch, setRecordSearch] = useState<string>("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Queries
  const ownershipParams = { clerkUserId };
  const { 
    data: ownerships = [], 
    isLoading: isLoadingOwnerships,
    isError: isOwnershipsError,
    isSuccess: isOwnershipsSuccess,
  } = useListCommunityOwnerships(ownershipParams, {
    query: { enabled: !!clerkUserId, queryKey: getListCommunityOwnershipsQueryKey(ownershipParams) },
  });

  // Mutations
  const linkMutation = useLinkCommunityOwnership();
  const unlinkMutation = useUnlinkCommunityOwnership();

  const form = useForm<LinkFormValues>({
    resolver: zodResolver(linkSchema),
    defaultValues: {
      recordType: "account",
      recordId: "",
    },
  });

  const selectedRecordType = form.watch("recordType");

  const candidateParams = {
    recordType: selectedRecordType,
    search: recordSearch.trim() || undefined,
  };
  const { data: candidates = [], isLoading: isLoadingCandidates } = useListCommunityOwnershipCandidates(candidateParams, {
    query: {
      enabled: Boolean(clerkUserId) && isOwnershipsSuccess,
      queryKey: getListCommunityOwnershipCandidatesQueryKey(candidateParams),
    },
  });

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = searchInput.trim();
    if (trimmed) {
      form.reset({ recordType: form.getValues("recordType"), recordId: "" });
      setRecordSearch("");
      setClerkUserId(trimmed);
    }
  };

  const onSubmitLink = (data: LinkFormValues) => {
    if (!clerkUserId) {
      toast({ title: "No user selected", description: "Search for a Clerk User ID first.", variant: "destructive" });
      return;
    }

    linkMutation.mutate(
      {
        data: {
          clerkUserId,
          recordType: data.recordType,
          recordId: data.recordId,
        }
      },
      {
        onSuccess: () => {
          toast({
            title: "Link Created",
            description: `Successfully linked ${getLabelForRecordType(data.recordType)} ${data.recordId} to user.`,
          });
          form.reset({ recordType: data.recordType, recordId: "" });
          setRecordSearch("");
          queryClient.invalidateQueries({ queryKey: getListCommunityOwnershipsQueryKey(ownershipParams) });
        },
        onError: (error: any) => {
          toast({
            title: "Failed to create link",
            description: error?.data?.error || error.message || "An unexpected error occurred",
            variant: "destructive",
          });
        }
      }
    );
  };

  const handleUnlink = (id: string, recordType: string, recordId: string) => {
    if (!window.confirm(`Are you sure you want to unlink ${getLabelForRecordType(recordType)} ${recordId}?`)) {
      return;
    }

    unlinkMutation.mutate(
      { id },
      {
        onSuccess: () => {
          toast({
            title: "Link Removed",
            description: "The record ownership link was successfully removed.",
          });
          queryClient.invalidateQueries({ queryKey: getListCommunityOwnershipsQueryKey(ownershipParams) });
        },
        onError: (error: any) => {
          toast({
            title: "Failed to remove link",
            description: error?.data?.error || error.message || "An unexpected error occurred",
            variant: "destructive",
          });
        }
      }
    );
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in w-full h-full pb-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Community Ownership</h1>
        <p className="text-muted-foreground mt-1">
          Manage verified record identity links for community users.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: User Search and List */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-6">
          <Card className="border-primary/10 shadow-sm">
            <CardHeader className="bg-primary/5 pb-4 border-b border-primary/10">
              <CardTitle className="text-sm uppercase tracking-wider text-primary flex items-center gap-2">
                <Search className="w-4 h-4" /> User Lookup
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={handleSearch} className="flex gap-3">
                <div className="flex-1">
                  <Label htmlFor="clerk-id" className="sr-only">Clerk User ID</Label>
                  <Input 
                    id="clerk-id"
                    placeholder="Enter Clerk User ID (e.g. user_2XyZ...)" 
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="font-mono text-sm bg-background"
                    data-testid="input-clerk-user-id"
                  />
                </div>
                <Button type="submit" disabled={!searchInput.trim()} className="shrink-0 font-bold" data-testid="button-find-links">
                  Find Links
                </Button>
              </form>
            </CardContent>
          </Card>

          {clerkUserId && (
            <Card className="border-border shadow-sm flex-1">
              <CardHeader className="pb-4 border-b">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Key className="w-4 h-4 text-primary" /> Active Links
                  </CardTitle>
                  <Badge variant="outline" className="font-mono bg-muted text-xs font-normal">
                    {clerkUserId}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {isLoadingOwnerships ? (
                  <div className="p-6 space-y-4">
                    {[1, 2, 3].map(i => (
                      <Skeleton key={i} className="h-16 w-full rounded-md" />
                    ))}
                  </div>
                ) : isOwnershipsError ? (
                  <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
                    <AlertCircle className="w-8 h-8 text-destructive mb-3" />
                    <p>Failed to load ownership records.</p>
                  </div>
                ) : ownerships.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground flex flex-col items-center bg-muted/20">
                    <Key className="w-8 h-8 opacity-20 mb-3" />
                    <p className="font-medium text-foreground">No links found</p>
                    <p className="text-sm mt-1">This user has no verified record ownership links.</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {ownerships.map((link: any) => (
                      <div key={link.id} className="p-4 hover:bg-muted/30 transition-colors flex items-center justify-between group">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                            {getIconForRecordType(link.recordType)}
                          </div>
                          <div>
                            <div className="font-semibold text-sm flex items-center gap-2">
                              {getLabelForRecordType(link.recordType)}
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                                {link.recordType}
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground font-mono mt-0.5">
                              ID: {link.recordId}
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-1">
                              Verified {new Date(link.verifiedAt).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive hover:bg-destructive/10 transition-all"
                          onClick={() => handleUnlink(link.id, link.recordType, link.recordId)}
                          disabled={unlinkMutation.isPending}
                          title="Remove link"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column: Add Link Form */}
        <div className="lg:col-span-5 xl:col-span-4">
          <Card className={`border-border shadow-sm transition-opacity duration-300 ${isOwnershipsSuccess ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
            <CardHeader className="bg-card pb-4 border-b">
              <CardTitle className="text-base flex items-center gap-2">
                <Plus className="w-4 h-4 text-primary" /> Create New Link
              </CardTitle>
              <CardDescription>
                Manually verify and link a record to this user.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmitLink)} className="space-y-5">
                  <FormField
                    control={form.control}
                    name="recordType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                          Record Type
                        </FormLabel>
                        <Select onValueChange={(value) => {
                          field.onChange(value);
                          form.setValue("recordId", "");
                          setRecordSearch("");
                        }} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-background">
                              <SelectValue placeholder="Select a record type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Object.entries(CommunityOwnershipInputRecordType).map(([key, value]) => (
                              <SelectItem key={value} value={value}>
                                <div className="flex items-center gap-2">
                                  {getIconForRecordType(value)}
                                  <span>{getLabelForRecordType(value)}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="recordId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                          Target Record ID
                        </FormLabel>
                        
                        <FormControl>
                          <div className="space-y-2">
                            <Input
                              placeholder="Search records or enter an exact ID"
                              value={recordSearch}
                              onChange={(event) => {
                                setRecordSearch(event.target.value);
                                field.onChange(event.target.value);
                              }}
                              className="font-mono bg-background"
                              data-testid="input-record-search"
                            />
                            {isLoadingCandidates && recordSearch && <div className="text-xs text-muted-foreground">Searching records...</div>}
                            {!isLoadingCandidates && candidates.length > 0 && recordSearch && (
                              <div className="max-h-44 overflow-y-auto rounded-md border bg-card">
                                {candidates.map((candidate: { id: string; label: string; detail?: string | null }) => (
                                  <button type="button" key={candidate.id} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs hover:bg-muted" onClick={() => { field.onChange(candidate.id); setRecordSearch(candidate.id); }} data-testid={`button-select-candidate-${candidate.id}`}>
                                    <span className="font-medium">{candidate.label}</span><span className="font-mono text-muted-foreground">{candidate.detail || candidate.id}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </FormControl>
                        
                        <div className="text-[11px] text-muted-foreground mt-2">
                          {isLoadingCandidates ? "Searching the verified record index..." : "Select a matching record or paste an exact ID."}
                        </div>
                        
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="pt-2">
                    <Button 
                      type="submit" 
                      className="w-full font-bold" 
                      disabled={!isOwnershipsSuccess || linkMutation.isPending}
                    >
                      {linkMutation.isPending ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verifying...</>
                      ) : (
                        "Verify & Link Record"
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
        
      </div>
    </div>
  );
}
