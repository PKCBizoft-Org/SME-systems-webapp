"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type InputHTMLAttributes,
} from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

type Client = {
  id: string;
  customer_name: string;
  install_date: string;
  plan_name: string;
  area: string;
  installation_status: string;
  account_status: string;
  account_id: string;
  mobile_number: string;
  pppoe_name: string;
  map_location: string;
  technicians: string;
  latitude?: number | null;
  longitude?: number | null;
};

type Billing = {
  id: string;
  bill_id: string;
  status: string;
  bill_type: string;
  bill_date: string;
  due_date: string;
  amount_due: number;
};
type Payment = {
  id: string;
  payment_id: string;
  receipt_number: string;
  amount_paid: number;
  payment_date: string;
  payment_method: string;
  billing: { bill_id: string; bill_type: string } | null;
};
type AuditLog = {
  id: number;
  tenant_id: string | null;
  client_id: string | null;
  changed_by_email: string | null;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  changed_at: string | null;
};
type SitePhoto = {
  id: string;
  client_id: string;
  photo_type: "house" | "post" | "installation";
  storage_path: string;
  caption: string | null;
  uploaded_by: string | null;
  created_at: string;
  url?: string;
};
type Repair = {
  id: string;
  client_id: string;
  technician: string | null;
  repair_date: string;
  problem_description: string;
  resolution: string | null;
  status: string;
  created_at: string;
  photos: RepairPhoto[];
};
type RepairPhoto = {
  id: string;
  repair_id: string;
  photo_type: "before" | "after";
  storage_path: string;
  created_at: string;
  url?: string;
};
type SaveStatus = "idle" | "saving" | "saved" | "error";

const BUCKET = "client-media";
const INSTALLATION_STATUS_OPTIONS = [
  "Scheduled",
  "Completed",
  "Cancelled",
  "Terminated",
];
const ACCOUNT_STATUS_OPTIONS = ["Paid", "Due", "Overdue"];
const PHOTO_TYPES = [
  {
    key: "house" as const,
    title: "House / Service Location",
    description: "Customer premises or building exterior.",
  },
  {
    key: "post" as const,
    title: "Post / Pole",
    description: "Pole, post, cable route or mounting point.",
  },
  {
    key: "installation" as const,
    title: "Installation",
    description: "Installed equipment, drop cable or final setup.",
  },
];

const formatCurrency = (value: number | null | undefined) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    Number(value || 0),
  );
const formatDate = (value?: string | null) =>
  value
    ? new Date(value).toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";
const safeFileName = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9.\-_]/g, "-");
const statusClass = (value?: string | null) => {
  const v = (value || "").toLowerCase();
  if (["paid", "completed", "active"].includes(v)) return "good";
  if (["overdue", "terminated", "cancelled"].includes(v)) return "bad";
  return "warn";
};

export default function ClientDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [client, setClient] = useState<Client | null>(null);
  const [billing, setBilling] = useState<Billing[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [sitePhotos, setSitePhotos] = useState<SitePhoto[]>([]);
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [installationSaveStatus, setInstallationSaveStatus] =
    useState<SaveStatus>("idle");
  const [accountSaveStatus, setAccountSaveStatus] =
    useState<SaveStatus>("idle");
  const [locatingServiceArea, setLocatingServiceArea] = useState(false);
  const [serviceAreaLocation, setServiceAreaLocation] = useState<{
    latitude: number;
    longitude: number;
    formattedAddress: string;
  } | null>(null);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showRepairForm, setShowRepairForm] = useState(false);
  const [repairSaving, setRepairSaving] = useState(false);
  const [repairForm, setRepairForm] = useState({
    technician: "",
    repair_date: new Date().toISOString().slice(0, 10),
    problem_description: "",
    resolution: "",
    status: "Completed",
  });
  const [repairBefore, setRepairBefore] = useState<File[]>([]);
  const [repairAfter, setRepairAfter] = useState<File[]>([]);
  const [locationForm, setLocationForm] = useState({
    map_location: "",
    latitude: "",
    longitude: "",
  });
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [fieldSaveStatus, setFieldSaveStatus] = useState<Record<string, SaveStatus>>({});
  const [lightboxPhoto, setLightboxPhoto] = useState<{
    url: string;
    alt: string;
    title: string;
    date: string;
  } | null>(null);

  const loadMedia = useCallback(async () => {
    const supabase = createClient();
    const { data: photoData } = await supabase
      .from("client_site_photos")
      .select("*")
      .eq("client_id", id)
      .order("created_at", { ascending: false });
    const photos = (photoData || []) as SitePhoto[];
    const withUrls = await Promise.all(
      photos.map(async (photo) => {
        const { data } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(photo.storage_path, 60 * 60);
        return { ...photo, url: data?.signedUrl };
      }),
    );
    setSitePhotos(withUrls);

    const { data: repairData } = await supabase
      .from("repair_records")
      .select("*")
      .eq("client_id", id)
      .order("repair_date", { ascending: false });
    const repairRows = (repairData || []) as Omit<Repair, "photos">[];
    if (!repairRows.length) {
      setRepairs([]);
      return;
    }
    const repairIds = repairRows.map((r) => r.id);
    const { data: repairPhotoData } = await supabase
      .from("repair_photos")
      .select("*")
      .in("repair_id", repairIds)
      .order("created_at", { ascending: false });
    const repairPhotos = (repairPhotoData || []) as RepairPhoto[];
    const signedRepairPhotos = await Promise.all(
      repairPhotos.map(async (photo) => {
        const { data } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(photo.storage_path, 60 * 60);
        return { ...photo, url: data?.signedUrl };
      }),
    );
    setRepairs(
      repairRows.map((repair) => ({
        ...repair,
        photos: signedRepairPhotos.filter((p) => p.repair_id === repair.id),
      })),
    );
  }, [id]);

  useEffect(() => {
    let mounted = true;
    const fetchAll = async () => {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.push("/login");
        return;
      }

      const { data: clientData, error: clientError } = await supabase
        .from("clients")
        .select("*")
        .eq("id", id)
        .single();
      if (clientError) {
        if (mounted) {
          setError(clientError.message);
          setLoading(false);
        }
        return;
      }
      if (!mounted) return;
      setClient(clientData as Client);
      setLocationForm({
        map_location: clientData.map_location || "",
        latitude:
          clientData.latitude != null ? String(clientData.latitude) : "",
        longitude:
          clientData.longitude != null ? String(clientData.longitude) : "",
      });

      const [
        { data: billingData },
        { data: paymentData },
        { data: auditData },
      ] = await Promise.all([
        supabase
          .from("billing")
          .select("*")
          .eq("client_id", id)
          .order("bill_date", { ascending: false }),
        supabase
          .from("payments")
          .select("*, billing(bill_id, bill_type)")
          .eq("client_id", id)
          .order("payment_date", { ascending: false }),
        supabase
          .from("audit_log")
          .select("*")
          .eq("client_id", id)
          .order("changed_at", { ascending: false }),
      ]);
      setBilling((billingData || []) as Billing[]);
      setPayments((paymentData || []) as unknown as Payment[]);
      setAuditLogs((auditData || []) as AuditLog[]);
      await loadMedia();
      if (mounted) setLoading(false);
    };
    fetchAll();
    return () => {
      mounted = false;
    };
  }, [id, router, loadMedia]);

  const saveClientField = useCallback(
    (
      field: keyof Pick<
        Client,
        | "customer_name"
        | "install_date"
        | "plan_name"
        | "area"
        | "account_id"
        | "mobile_number"
        | "pppoe_name"
        | "technicians"
        | "map_location"
        | "latitude"
        | "longitude"
      >,
      value: string | number | null,
    ) => {
      if (!client) return;

      setClient((current) => (current ? { ...current, [field]: value } : current));
      setFieldSaveStatus((current) => ({ ...current, [field]: "saving" }));

      const existingTimer = saveTimers.current[field];
      if (existingTimer) clearTimeout(existingTimer);

      saveTimers.current[field] = setTimeout(async () => {
        const supabase = createClient();
        const { error: saveError } = await supabase
          .from("clients")
          .update({ [field]: value })
          .eq("id", id);

        if (saveError) {
          setFieldSaveStatus((current) => ({ ...current, [field]: "error" }));
          setNotice(`Could not save ${String(field).replaceAll("_", " ")}: ${saveError.message}`);
        } else {
          setFieldSaveStatus((current) => ({ ...current, [field]: "saved" }));
          window.setTimeout(() => {
            setFieldSaveStatus((current) => ({ ...current, [field]: "idle" }));
          }, 1800);
        }
      }, 650);
    },
    [client, id],
  );

  useEffect(() => {
    return () => {
      Object.values(saveTimers.current).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const updateStatus = async (
    field: "installation_status" | "account_status",
    value: string,
  ) => {
    if (!client) return;
    const previous = client[field];
    setClient((p) => (p ? { ...p, [field]: value } : p));
    const setStatus =
      field === "installation_status"
        ? setInstallationSaveStatus
        : setAccountSaveStatus;
    setStatus("saving");
    const { error: saveError } = await createClient()
      .from("clients")
      .update({ [field]: value })
      .eq("id", id);
    if (saveError) {
      setClient((p) => (p ? { ...p, [field]: previous } : p));
      setStatus("error");
      setNotice(`Could not save ${field.replaceAll("_", " ")}: ${saveError.message}`);
      setTimeout(() => setStatus("idle"), 3500);
      return;
    }
    setStatus("saved");
    setTimeout(() => setStatus("idle"), 2200);
  };

  const locateServiceArea = useCallback(async () => {
    const area = client?.area?.trim();
    if (!area) {
      setNotice("No service area is recorded for this customer.");
      return;
    }

    setLocatingServiceArea(true);
    setNotice("");

    try {
      const params = new URLSearchParams({ q: area });

      const response = await fetch(`/api/geocode?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to locate the service area.");
      }

      setServiceAreaLocation({
        latitude: Number(data.latitude),
        longitude: Number(data.longitude),
        formattedAddress: data.formattedAddress || area,
      });

      setLocationForm((current) => ({
        ...current,
        map_location: data.formattedAddress || current.map_location || area,
      }));

      setNotice(
        data.formattedAddress
          ? `Service area found: ${data.formattedAddress}. Review it, then save the location.`
          : "Service area coordinates found. Review them, then save the location.",
      );
    } catch (err) {
      setNotice(
        `Service area lookup failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      setLocatingServiceArea(false);
    }
  }, [client?.area]);

  useEffect(() => {
    if (!client?.area?.trim()) {
      setServiceAreaLocation(null);
      return;
    }

    void locateServiceArea();
  }, [client?.area, locateServiceArea]);

  const updateLocationField = (
    field: "map_location" | "latitude" | "longitude",
    rawValue: string,
  ) => {
    setLocationForm((current) => ({ ...current, [field]: rawValue }));

    if (field === "map_location") {
      saveClientField("map_location", rawValue.trim());
      return;
    }

    if (rawValue.trim() === "") {
      saveClientField(field, null);
      return;
    }

    const value = Number(rawValue);
    if (!Number.isFinite(value)) return;
    if (field === "latitude" && (value < -90 || value > 90)) return;
    if (field === "longitude" && (value < -180 || value > 180)) return;
    saveClientField(field, value);
  };

  const uploadSitePhotos = async (
    type: SitePhoto["photo_type"],
    files: FileList | null,
  ) => {
    if (!files?.length) return;
    setUploadingType(type);
    setNotice("");
    const supabase = createClient();
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const path = `clients/${id}/site/${type}/${Date.now()}-${safeFileName(file.name)}`;
        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { upsert: false, contentType: file.type });
        if (uploadError) throw uploadError;
        const { data: userData } = await supabase.auth.getUser();
        const { error: insertError } = await supabase
          .from("client_site_photos")
          .insert({
            client_id: id,
            photo_type: type,
            storage_path: path,
            caption: null,
            uploaded_by: userData.user?.email || null,
          });
        if (insertError) {
          await supabase.storage.from(BUCKET).remove([path]);
          throw insertError;
        }
      }
      await loadMedia();
      setNotice("Photo upload complete.");
    } catch (err) {
      setNotice(
        `Photo upload failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      setUploadingType(null);
    }
  };

  const deleteSitePhoto = async (photo: SitePhoto) => {
    if (!window.confirm("Delete this site photo?")) return;
    setDeletingId(photo.id);
    const supabase = createClient();
    await supabase.storage.from(BUCKET).remove([photo.storage_path]);
    const { error: deleteError } = await supabase
      .from("client_site_photos")
      .delete()
      .eq("id", photo.id);
    if (deleteError)
      setNotice(`Could not delete photo: ${deleteError.message}`);
    else setSitePhotos((p) => p.filter((x) => x.id !== photo.id));
    setDeletingId(null);
  };

  const createRepair = async (e: FormEvent) => {
    e.preventDefault();
    if (!repairForm.problem_description.trim()) return;
    setRepairSaving(true);
    setNotice("");
    const supabase = createClient();
    try {
      const { data: repair, error: repairError } = await supabase
        .from("repair_records")
        .insert({
          client_id: id,
          technician: repairForm.technician.trim() || null,
          repair_date: repairForm.repair_date,
          problem_description: repairForm.problem_description.trim(),
          resolution: repairForm.resolution.trim() || null,
          status: repairForm.status,
        })
        .select("*")
        .single();
      if (repairError) throw repairError;
      const repairId = (repair as Repair).id;
      const { data: userData } = await supabase.auth.getUser();
      const uploadRepairPhotos = async (
        files: File[],
        type: "before" | "after",
      ) => {
        for (const file of files) {
          if (!file.type.startsWith("image/")) continue;
          const path = `clients/${id}/repairs/${repairId}/${type}/${Date.now()}-${safeFileName(file.name)}`;
          const { error: uploadError } = await supabase.storage
            .from(BUCKET)
            .upload(path, file, { upsert: false, contentType: file.type });
          if (uploadError) throw uploadError;
          const { error: photoError } = await supabase
            .from("repair_photos")
            .insert({
              repair_id: repairId,
              photo_type: type,
              storage_path: path,
            });
          if (photoError) {
            await supabase.storage.from(BUCKET).remove([path]);
            throw photoError;
          }
        }
      };
      await uploadRepairPhotos(repairBefore, "before");
      await uploadRepairPhotos(repairAfter, "after");
      void userData;
      await loadMedia();
      setRepairForm({
        technician: "",
        repair_date: new Date().toISOString().slice(0, 10),
        problem_description: "",
        resolution: "",
        status: "Completed",
      });
      setRepairBefore([]);
      setRepairAfter([]);
      setShowRepairForm(false);
      setNotice("Repair record saved.");
    } catch (err) {
      setNotice(
        `Repair could not be saved: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      setRepairSaving(false);
    }
  };

  const deleteRepair = async (repair: Repair) => {
    if (!window.confirm("Delete this repair record and its photos?")) return;
    setDeletingId(repair.id);
    const supabase = createClient();
    for (const photo of repair.photos)
      await supabase.storage.from(BUCKET).remove([photo.storage_path]);
    const { error: deleteError } = await supabase
      .from("repair_records")
      .delete()
      .eq("id", repair.id);
    if (deleteError)
      setNotice(`Could not delete repair: ${deleteError.message}`);
    else setRepairs((p) => p.filter((x) => x.id !== repair.id));
    setDeletingId(null);
  };

  const totals = useMemo(
    () => ({
      billed: billing.reduce((s, b) => s + Number(b.amount_due || 0), 0),
      paid: payments.reduce((s, p) => s + Number(p.amount_paid || 0), 0),
    }),
    [billing, payments],
  );

  if (loading)
    return (
      <main className="statePage">
        <div className="loader">
          <span /> Loading customer record
        </div>
      </main>
    );

  if (error)
    return (
      <main className="statePage">
        <div className="stateCard">
          <b>Unable to load customer</b>
          <p>{error}</p>
          <Link href="/clients" className="button">
            Back to Customers
          </Link>
        </div>
      </main>
    );

  // Hooks must run on every render in the exact same order.
  // Keep totals above the conditional return so loading/error/empty states
  // do not change the hook order.
  if (!client)
    return (
      <main className="statePage">
        <div className="stateCard">
          <b>Customer record not found</b>
          <p>The customer record is unavailable or no longer exists.</p>
          <Link href="/clients" className="button">
            Back to Customers
          </Link>
        </div>
      </main>
    );
  const outstanding = Math.max(totals.billed - totals.paid, 0);

  const hasSavedCustomerCoordinates =
    client?.latitude != null && client?.longitude != null;
  const hasServiceAreaCoordinates =
    serviceAreaLocation != null &&
    Number.isFinite(serviceAreaLocation.latitude) &&
    Number.isFinite(serviceAreaLocation.longitude);
  const openStreetMapLink = hasSavedCustomerCoordinates
    ? `https://www.openstreetmap.org/?mlat=${client.latitude}&mlon=${client.longitude}#map=18/${client.latitude}/${client.longitude}`
    : hasServiceAreaCoordinates
      ? `https://www.openstreetmap.org/?mlat=${serviceAreaLocation.latitude}&mlon=${serviceAreaLocation.longitude}#map=16/${serviceAreaLocation.latitude}/${serviceAreaLocation.longitude}`
      : "";

  const customerDistanceKm =
    hasSavedCustomerCoordinates && hasServiceAreaCoordinates
      ? calculateDistanceKm(
          serviceAreaLocation!.latitude,
          serviceAreaLocation!.longitude,
          client.latitude!,
          client.longitude!,
        )
      : null;

  const health = getCustomerHealth({
    accountStatus: client.account_status,
    installationStatus: client.installation_status,
    outstanding,
    hasExactLocation: hasSavedCustomerCoordinates,
    repairCount: repairs.length,
  });

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const copyCoordinates = async () => {
    if (!hasSavedCustomerCoordinates) return;
    try {
      await navigator.clipboard.writeText(
        `${client.latitude!.toFixed(6)}, ${client.longitude!.toFixed(6)}`,
      );
      setNotice("Customer coordinates copied to clipboard.");
    } catch {
      setNotice("Could not copy coordinates. Please copy them manually.");
    }
  };

  return (
    <main className="clientPage">
      <div className="ambient ambientOne" />
      <div className="ambient ambientTwo" />
      <div className="pageShell">
        <header className="topbar">
          <Link href="/clients" className="backLink">
            ← <span>Customers</span>
          </Link>
          <div className="topbarMeta">
            <span className="pulseDot" /> CUSTOMER RECORD{" "}
            <b>/{client.account_id || client.id.slice(0, 8)}</b>
          </div>
        </header>

        {notice && (
          <div className="notice">
            {notice}
            <button onClick={() => setNotice("")} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}

        <section className="heroCard">
          <div>
            <div className="eyebrow">CUSTOMER OVERVIEW / SERVICE ACCOUNT</div>
            <h1>{client.customer_name}</h1>
            <p className="heroSub">
              Service account{" "}
              <strong>{client.account_id || "Unassigned"}</strong> ·{" "}
              {client.area || "Area not specified"}
            </p>
            <div className="quickActions">
              {client.mobile_number && (
                <>
                  <a className="quickAction" href={`tel:${client.mobile_number}`}>
                    <span>☎</span> Call
                  </a>
                  <a className="quickAction" href={`sms:${client.mobile_number}`}>
                    <span>✉</span> SMS
                  </a>
                </>
              )}
              <button className="quickAction" type="button" onClick={() => scrollToSection("location-section")}>
                <span>⌖</span> Location
              </button>
              <button className="quickAction" type="button" onClick={() => scrollToSection("photos-section")}>
                <span>▣</span> Photos
              </button>
              <button className="quickAction" type="button" onClick={() => scrollToSection("repairs-section")}>
                <span>⚒</span> Repair
              </button>
            </div>
          </div>
          <div className="heroStatus">
            <span
              className={`statusDot ${statusClass(client.account_status)}`}
            />
            <span>{client.account_status || "Unknown"}</span>
            <small>ACCOUNT STANDING</small>
            <div className={`healthBadge ${health.tone}`}>
              <i />
              {health.label}
            </div>
            <small className="healthReason">{health.reason}</small>
          </div>
        </section>

        <section className="statsGrid">
          <div className="stat">
            <span>SERVICE PLAN</span>
            <strong>{client.plan_name || "—"}</strong>
            <small>Current subscription</small>
          </div>
          <div className="stat">
            <span>INSTALLATION</span>
            <strong className={statusClass(client.installation_status)}>
              {client.installation_status || "—"}
            </strong>
            <small>{formatDate(client.install_date)}</small>
          </div>
          <div className="stat">
            <span>TOTAL BILLED</span>
            <strong>{formatCurrency(totals.billed)}</strong>
            <small>{billing.length} billing record{billing.length === 1 ? "" : "s"}</small>
          </div>
          <div className="stat">
            <span>OUTSTANDING</span>
            <strong className={outstanding > 0 ? "warnText" : "goodText"}>
              {formatCurrency(outstanding)}
            </strong>
            <small>{outstanding > 0 ? "Balance requiring attention" : "Account is settled"}</small>
          </div>
          <div className="stat">
            <span>SITE PHOTOS</span>
            <strong>{sitePhotos.length}</strong>
            <small>{sitePhotos.length ? "Visual records available" : "Installation proof missing"}</small>
          </div>
          <div className="stat">
            <span>REPAIRS</span>
            <strong>{repairs.length}</strong>
            <small>{repairs.length ? "Service visits recorded" : "No repairs recorded"}</small>
          </div>
        </section>

        <section className="contentGrid">
          <article className="panel">
            <PanelHeader
              index="01"
              title="Customer Details"
              subtitle="Contact and service information"
            />
            <div className="detailGrid editableDetailGrid">
              <EditableField
                label="Customer Name"
                value={client.customer_name}
                saveStatus={fieldSaveStatus.customer_name}
                onChange={(value) => saveClientField("customer_name", value)}
              />
              <EditableField
                label="Account Reference"
                value={client.account_id}
                saveStatus={fieldSaveStatus.account_id}
                onChange={(value) => saveClientField("account_id", value)}
              />
              <EditableField
                label="Contact Number"
                value={client.mobile_number}
                inputMode="tel"
                saveStatus={fieldSaveStatus.mobile_number}
                onChange={(value) => saveClientField("mobile_number", value)}
              />
              <EditableField
                label="Service Area"
                value={client.area}
                saveStatus={fieldSaveStatus.area}
                onChange={(value) => saveClientField("area", value)}
              />
              <EditableField
                label="Service Plan"
                value={client.plan_name}
                saveStatus={fieldSaveStatus.plan_name}
                onChange={(value) => saveClientField("plan_name", value)}
              />
              <EditableField
                label="PPPoE Username"
                value={client.pppoe_name}
                saveStatus={fieldSaveStatus.pppoe_name}
                onChange={(value) => saveClientField("pppoe_name", value)}
              />
              <EditableField
                label="Installation Date"
                value={client.install_date}
                type="date"
                saveStatus={fieldSaveStatus.install_date}
                onChange={(value) => saveClientField("install_date", value || null)}
              />
              <EditableField
                label="Assigned Technicians"
                value={client.technicians}
                saveStatus={fieldSaveStatus.technicians}
                onChange={(value) => saveClientField("technicians", value)}
              />
            </div>
          </article>

          <article className="panel">
            <PanelHeader
              index="02"
              title="Service Status"
              subtitle="Operational account controls"
            />
            <div className="controlStack">
              <StatusControl
                label="Installation"
                value={client.installation_status}
                options={INSTALLATION_STATUS_OPTIONS}
                onChange={(v) => updateStatus("installation_status", v)}
                saveStatus={installationSaveStatus}
              />
              <StatusControl
                label="Account Standing"
                value={client.account_status}
                options={ACCOUNT_STATUS_OPTIONS}
                onChange={(v) => updateStatus("account_status", v)}
                saveStatus={accountSaveStatus}
              />
            </div>
          </article>
        </section>

        <section id="location-section" className="panel locationPanel">
          <PanelHeader
            index="03"
            title="Service Location"
            subtitle="Free OpenStreetMap map · service area plus the exact saved customer pin"
          />

          <div className="locationTools">
            <div className="locationToolCard">
              <div className="toolIcon">◎</div>
              <div className="toolCopy">
                <b>Customer Service Area</b>
                <small>
                  Automatically geocoded from this customer's Service Area.
                  The admin's browser location is never used.
                </small>
                {serviceAreaLocation && (
                  <span className="locationDetected">
                    AREA FOUND · {serviceAreaLocation.formattedAddress}
                  </span>
                )}
              </div>
              <button
                type="button"
                className="button secondary"
                onClick={() => void locateServiceArea()}
                disabled={locatingServiceArea || !client.area?.trim()}
              >
                {locatingServiceArea ? "Searching…" : "Refresh Area"}
              </button>
            </div>

            <div className="locationToolCard">
              <div className="toolIcon">⌖</div>
              <div className="toolCopy">
                <b>Exact Customer Coordinates</b>
                <small>
                  The map marker uses the latitude and longitude saved on this
                  customer's record, not the admin's current location.
                </small>
                {hasSavedCustomerCoordinates ? (
                  <>
                    <span className="locationDetected">
                      CUSTOMER PIN · {client.latitude?.toFixed(6)}, {client.longitude?.toFixed(6)}
                    </span>
                    {customerDistanceKm !== null && (
                      <span className="locationMetric">
                        {customerDistanceKm < 1
                          ? `${Math.round(customerDistanceKm * 1000)} m from service-area pin`
                          : `${customerDistanceKm.toFixed(2)} km from service-area pin`}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="locationPending">EXACT CUSTOMER PIN NOT SET</span>
                )}
              </div>
              {hasSavedCustomerCoordinates && (
                <button type="button" className="miniButton" onClick={() => void copyCoordinates()}>
                  Copy
                </button>
              )}
            </div>
          </div>

          <div className="locationLayout">
            <div className="mapFrame">
              {hasServiceAreaCoordinates || hasSavedCustomerCoordinates ? (
                <LeafletCustomerMap
                  serviceArea={serviceAreaLocation}
                  customerCoordinates={
                    hasSavedCustomerCoordinates
                      ? {
                          latitude: client.latitude!,
                          longitude: client.longitude!,
                        }
                      : null
                  }
                  customerName={client.customer_name}
                />
              ) : (
                <div className="mapEmpty">
                  <span>⌖</span>
                  <b>{locatingServiceArea ? "Finding service area…" : "No location found"}</b>
                  <small>
                    The customer's Service Area is being used to locate the map.
                  </small>
                </div>
              )}
              {(hasServiceAreaCoordinates || hasSavedCustomerCoordinates) && (
                <div className="mapLegend">
                  <span><i className="legendArea" /> Service area</span>
                  {hasSavedCustomerCoordinates && <span><i className="legendCustomer" /> Exact customer</span>}
                </div>
              )}
              <div className="mapStatus">
                <span className="mapStatusDot" />
                {hasSavedCustomerCoordinates
                  ? "CUSTOMER AREA • EXACT CUSTOMER PIN"
                  : hasServiceAreaCoordinates
                    ? "CUSTOMER AREA • SERVICE AREA PIN"
                    : "CUSTOMER AREA • LOOKING UP"}
              </div>
              {openStreetMapLink && (
                <a
                  className="mapOpen"
                  href={openStreetMapLink}
                  target="_blank"
                  rel="noreferrer"
                >
                  OPEN IN OPENSTREETMAP ↗
                </a>
              )}
            </div>

            <form className="locationForm" onSubmit={(e) => e.preventDefault()}>
              <label>
                Service Area
                <input
                  value={client.area || ""}
                  onChange={(e) => saveClientField("area", e.target.value)}
                  placeholder="Customer service area"
                />
                <small className="fieldHint">
                  Pulled from the customer record. Use “Refresh Area” to search it.
                </small>
              </label>

              <label>
                Map Location Reference
                <input
                  value={locationForm.map_location}
                  onChange={(e) => updateLocationField("map_location", e.target.value)}
                  placeholder="Address or map reference"
                />
              </label>

              <div className="coordGrid">
                <label>
                  Latitude
                  <input
                    inputMode="decimal"
                    value={locationForm.latitude}
                    onChange={(e) => updateLocationField("latitude", e.target.value)}
                    placeholder="e.g. 7.1907"
                  />
                </label>
                <label>
                  Longitude
                  <input
                    inputMode="decimal"
                    value={locationForm.longitude}
                    onChange={(e) => updateLocationField("longitude", e.target.value)}
                    placeholder="e.g. 125.4553"
                  />
                </label>
              </div>

              <div className="locationHint">
                <span>✓</span>
                <div>
                  <b>Location privacy</b>
                  <small>
                    No browser location permission is required. The map uses the customer Service Area and the exact coordinates saved on the customer record.
                  </small>
                </div>
              </div>
              <div className="autosaveNote">
                <span>●</span> Location changes save automatically to Supabase.
              </div>
            </form>
          </div>
        </section>

        <section id="photos-section" className="panel">
          <PanelHeader
            index="04"
            title="Installation & Site Photos"
            subtitle="Keep visual proof of the customer premises and network installation"
          />
          <div className="photoTypeGrid">
            {PHOTO_TYPES.map((type) => {
              const photos = sitePhotos.filter(
                (p) => p.photo_type === type.key,
              );
              return (
                <div className="photoGroup" key={type.key}>
                  <div className="photoGroupHead">
                    <div>
                      <b>{type.title}</b>
                      <small>{type.description}</small>
                    </div>
                    <span>{photos.length}</span>
                  </div>
                  <div className="photoGrid">
                    {photos.map((photo) => (
                      <figure className="photoCard" key={photo.id}>
                        <button
                          type="button"
                          className="photoOpen"
                          onClick={() =>
                            photo.url &&
                            setLightboxPhoto({
                              url: photo.url,
                              alt: photo.caption || type.title,
                              title: type.title,
                              date: formatDate(photo.created_at),
                            })
                          }
                          aria-label={`Open ${type.title} photo`}
                        >
                          {photo.url ? (
                            <img
                              src={photo.url}
                              alt={photo.caption || type.title}
                            />
                          ) : (
                            <div className="photoBroken">No preview</div>
                          )}
                        </button>
                        <button
                          onClick={() => deleteSitePhoto(photo)}
                          disabled={deletingId === photo.id}
                          aria-label="Delete photo"
                        >
                          {deletingId === photo.id ? "…" : "×"}
                        </button>
                        <figcaption>{formatDate(photo.created_at)}</figcaption>
                      </figure>
                    ))}
                    <label className="uploadTile">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) =>
                          uploadSitePhotos(type.key, e.target.files)
                        }
                        disabled={uploadingType === type.key}
                      />
                      <span>＋</span>
                      <b>
                        {uploadingType === type.key
                          ? "Uploading…"
                          : "Add photos"}
                      </b>
                      <small>JPG, PNG, WEBP</small>
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section id="repairs-section" className="panel">
          <div className="sectionHeader">
            <PanelHeader
              index="05"
              title="Repair & Maintenance"
              subtitle="Document service visits, issues and before/after evidence"
            />
            <button
              className="button primary"
              onClick={() => setShowRepairForm((v) => !v)}
            >
              {showRepairForm ? "Close Form" : "+ Record Repair"}
            </button>
          </div>
          {showRepairForm && (
            <form className="repairForm" onSubmit={createRepair}>
              <div className="repairFormGrid">
                <label>
                  Technician
                  <input
                    value={repairForm.technician}
                    onChange={(e) =>
                      setRepairForm({
                        ...repairForm,
                        technician: e.target.value,
                      })
                    }
                    placeholder="Technician name"
                  />
                </label>
                <label>
                  Service Date
                  <input
                    type="date"
                    value={repairForm.repair_date}
                    onChange={(e) =>
                      setRepairForm({
                        ...repairForm,
                        repair_date: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Status
                  <select
                    value={repairForm.status}
                    onChange={(e) =>
                      setRepairForm({ ...repairForm, status: e.target.value })
                    }
                  >
                    <option>Completed</option>
                    <option>In Progress</option>
                    <option>Pending</option>
                    <option>Cancelled</option>
                  </select>
                </label>
              </div>
              <label>
                Issue / Problem
                <textarea
                  required
                  value={repairForm.problem_description}
                  onChange={(e) =>
                    setRepairForm({
                      ...repairForm,
                      problem_description: e.target.value,
                    })
                  }
                  placeholder="What problem was reported or found?"
                />
              </label>
              <label>
                Resolution / Work Performed
                <textarea
                  value={repairForm.resolution}
                  onChange={(e) =>
                    setRepairForm({ ...repairForm, resolution: e.target.value })
                  }
                  placeholder="What was repaired, replaced or adjusted?"
                />
              </label>
              <div className="repairUploads">
                <FilePicker
                  title="Before photos"
                  files={repairBefore}
                  setFiles={setRepairBefore}
                />
                <FilePicker
                  title="After photos"
                  files={repairAfter}
                  setFiles={setRepairAfter}
                />
              </div>
              <button className="button primary" disabled={repairSaving}>
                {repairSaving ? "Saving repair…" : "Save Repair Record"}
              </button>
            </form>
          )}
          <div className="repairList">
            {!repairs.length && !showRepairForm && (
              <EmptyState
                icon="✓"
                title="No repair records yet"
                text="Use Record Repair to document the next service visit."
              />
            )}
            {repairs.map((repair) => (
              <article className="repairCard" key={repair.id}>
                <div className="repairHead">
                  <div>
                    <span className={`tag ${statusClass(repair.status)}`}>
                      {repair.status}
                    </span>
                    <h3>{repair.problem_description}</h3>
                    <small>
                      {formatDate(repair.repair_date)} ·{" "}
                      {repair.technician || "Technician not recorded"}
                    </small>
                  </div>
                  <button
                    className="iconButton"
                    onClick={() => deleteRepair(repair)}
                    disabled={deletingId === repair.id}
                  >
                    Delete
                  </button>
                </div>
                {repair.resolution && (
                  <div className="resolution">
                    <span>RESOLUTION</span>
                    <p>{repair.resolution}</p>
                  </div>
                )}
                {!!repair.photos.length && (
                  <div className="repairPhotoStrip">
                    {repair.photos.map((photo) => (
                      <a
                        href={photo.url || "#"}
                        target="_blank"
                        rel="noreferrer"
                        key={photo.id}
                        className="repairPhoto"
                      >
                        <img
                          src={photo.url}
                          alt={`${photo.photo_type} repair evidence`}
                        />
                        <span>{photo.photo_type}</span>
                      </a>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="contentGrid lowerGrid">
          <article className="panel tablePanel">
            <PanelHeader
              index="06"
              title="Billing & Charges"
              subtitle="Account billing history"
            />
            <DataTable
              headers={[
                "Bill ID",
                "Type",
                "Bill Date",
                "Due Date",
                "Amount",
                "Status",
              ]}
              rows={billing.map((b) => [
                b.bill_id,
                b.bill_type,
                formatDate(b.bill_date),
                formatDate(b.due_date),
                formatCurrency(b.amount_due),
                b.status,
              ])}
              empty="No billing records yet."
            />
          </article>
          <article className="panel tablePanel">
            <PanelHeader
              index="07"
              title="Payments"
              subtitle="Recorded payments"
            />
            <DataTable
              headers={["Receipt", "Bill", "Date", "Method", "Paid"]}
              rows={payments.map((p) => [
                p.receipt_number,
                p.billing?.bill_id || "—",
                formatDate(p.payment_date),
                p.payment_method,
                formatCurrency(p.amount_paid),
              ])}
              empty="No payment records yet."
            />
          </article>
        </section>

        <section className="panel auditPanel">
          <PanelHeader
            index="08"
            title="Activity Log"
            subtitle="Recent changes to this customer record"
          />
          {!auditLogs.length ? (
            <EmptyState
              icon="◌"
              title="No activity recorded"
              text="Changes will appear here when audit records are created."
            />
          ) : (
            <div className="auditList">
              {auditLogs.map((log) => (
                <div className="auditRow" key={log.id}>
                  <span className="auditLine" />
                  <div>
                    <b>{log.field_name || "Record updated"}</b>
                    <p>
                      {log.old_value || "—"} <span>→</span>{" "}
                      {log.new_value || "—"}
                    </p>
                  </div>
                  <time>
                    {formatDate(log.changed_at)}
                    <small>{log.changed_by_email || "System"}</small>
                  </time>
                </div>
              ))}
            </div>
          )}
        </section>
        {lightboxPhoto && (
          <div
            className="lightbox"
            role="dialog"
            aria-modal="true"
            aria-label="Photo preview"
            onClick={() => setLightboxPhoto(null)}
          >
            <div className="lightboxPanel" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="lightboxClose"
                onClick={() => setLightboxPhoto(null)}
                aria-label="Close photo preview"
              >
                ×
              </button>
              <img src={lightboxPhoto.url} alt={lightboxPhoto.alt} />
              <div className="lightboxMeta">
                <b>{lightboxPhoto.title}</b>
                <span>{lightboxPhoto.date}</span>
              </div>
            </div>
          </div>
        )}

        <footer className="footer">
          <span>PKC BIZOFT / CUSTOMER OPERATIONS</span>
          <span>PRIVATE SERVICE RECORD</span>
        </footer>
      </div>
      <style jsx>{styles}</style>
    </main>
  );
}


function LeafletCustomerMap({
  serviceArea,
  customerCoordinates,
  customerName,
}: {
  serviceArea: {
    latitude: number;
    longitude: number;
    formattedAddress: string;
  } | null;
  customerCoordinates: { latitude: number; longitude: number } | null;
  customerName: string;
}) {
  const mapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let map: any = null;
    let leaflet: any = null;

    const loadLeaflet = async () => {
      if (!mapRef.current || (!serviceArea && !customerCoordinates)) return;

      try {
        if (!document.querySelector('link[data-leaflet-css="customer-map"]')) {
          const css = document.createElement("link");
          css.rel = "stylesheet";
          css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
          css.dataset.leafletCss = "customer-map";
          document.head.appendChild(css);
        }

        const existing = (window as any).L;
        if (existing) {
          leaflet = existing;
        } else {
          await new Promise<void>((resolve, reject) => {
            const existingScript = document.querySelector<HTMLScriptElement>(
              'script[data-leaflet="customer-map"]',
            );

            if (existingScript) {
              existingScript.addEventListener("load", () => resolve(), { once: true });
              existingScript.addEventListener("error", () => reject(new Error("Leaflet failed to load.")), { once: true });
              return;
            }

            const script = document.createElement("script");
            script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
            script.async = true;
            script.dataset.leaflet = "customer-map";
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("Leaflet failed to load."));
            document.body.appendChild(script);
          });

          leaflet = (window as any).L;
        }

        if (cancelled || !mapRef.current || !leaflet) return;

        const servicePoint = serviceArea
          ? leaflet.latLng(serviceArea.latitude, serviceArea.longitude)
          : null;
        const customerPoint = customerCoordinates
          ? leaflet.latLng(customerCoordinates.latitude, customerCoordinates.longitude)
          : null;
        const center = servicePoint || customerPoint;

        map = leaflet.map(mapRef.current, {
          zoomControl: true,
          attributionControl: true,
          scrollWheelZoom: true,
        });

        map.setView(center, customerPoint ? 16 : 14);

        leaflet
          .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>',
          })
          .addTo(map);

        const areaIcon = leaflet.divIcon({
          className: "customerMapMarkerWrap",
          html: '<div class="customerMapMarker areaMarker"><span class="markerText">A</span></div>',
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });
        const customerIcon = leaflet.divIcon({
          className: "customerMapMarkerWrap",
          html: '<div class="customerMapMarker customerMarker"><span class="markerText">C</span></div>',
          iconSize: [38, 38],
          iconAnchor: [19, 19],
        });

        const points: any[] = [];

        if (servicePoint) {
          points.push(servicePoint);
          leaflet
            .marker(servicePoint, { icon: areaIcon, title: "Customer Service Area" })
            .addTo(map)
            .bindPopup(
              `<strong>Customer Service Area</strong><br/><span>${escapeHtml(serviceArea?.formattedAddress || "Service area")}</span>`,
            );
        }

        if (customerPoint) {
          points.push(customerPoint);
          leaflet
            .marker(customerPoint, { icon: customerIcon, title: `Exact location: ${customerName}` })
            .addTo(map)
            .bindPopup(
              `<strong>${escapeHtml(customerName)}</strong><br/><span>Exact saved customer coordinates</span><br/><small>${customerCoordinates?.latitude.toFixed(6)}, ${customerCoordinates?.longitude.toFixed(6)}</small>`,
            );
        }

        if (points.length > 1) {
          map.fitBounds(leaflet.latLngBounds(points), { padding: [45, 45], maxZoom: 16 });
        }

        setTimeout(() => map?.invalidateSize(), 50);
      } catch (err) {
        console.error("Leaflet map failed to load:", err);
      }
    };

    void loadLeaflet();

    return () => {
      cancelled = true;
      if (map) {
        map.remove();
        map = null;
      }
    };
  }, [serviceArea, customerCoordinates, customerName]);

  return (
    <div
      ref={mapRef}
      className="customerLeafletMap"
      aria-label={`OpenStreetMap map for ${customerName}`}
    />
  );
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function PanelHeader({
  index,
  title,
  subtitle,
}: {
  index: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="panelHeader">
      <div className="panelIndex">{index}</div>
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}
function EditableField({
  label,
  value,
  type = "text",
  inputMode,
  saveStatus,
  onChange,
}: {
  label: string;
  value?: string | null;
  type?: "text" | "date";
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
  saveStatus?: SaveStatus;
  onChange: (value: string) => void;
}) {
  return (
    <label className="editableField">
      <span>{label}</span>
      <div className="editableInputWrap">
        <input
          type={type}
          inputMode={inputMode}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Enter ${label.toLowerCase()}`}
          aria-label={label}
        />
        {saveStatus && saveStatus !== "idle" && (
          <em className={saveStatus}>
            {saveStatus === "saving"
              ? "Saving…"
              : saveStatus === "saved"
                ? "Saved"
                : "Failed"}
          </em>
        )}
      </div>
      <small>Autosaves to Supabase</small>
    </label>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="detail">
      <span>{label}</span>
      <b>{value || "—"}</b>
    </div>
  );
}
function StatusControl({
  label,
  value,
  options,
  onChange,
  saveStatus,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  saveStatus: SaveStatus;
}) {
  return (
    <div className="statusControl">
      <div>
        <span>{label}</span>
        <small>Changes save automatically</small>
      </div>
      <div className="statusRight">
        <select value={value || ""} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        {saveStatus !== "idle" && (
          <em className={saveStatus}>
            {saveStatus === "saving"
              ? "Saving…"
              : saveStatus === "saved"
                ? "Saved"
                : "Failed"}
          </em>
        )}
      </div>
    </div>
  );
}
function EmptyState({
  icon,
  title,
  text,
}: {
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <div className="empty">
      <span>{icon}</span>
      <div>
        <b>{title}</b>
        <small>{text}</small>
      </div>
    </div>
  );
}
function FilePicker({
  title,
  files,
  setFiles,
}: {
  title: string;
  files: File[];
  setFiles: (files: File[]) => void;
}) {
  const onChange = (e: ChangeEvent<HTMLInputElement>) =>
    setFiles(Array.from(e.target.files || []));
  return (
    <label className="filePicker">
      <input type="file" accept="image/*" multiple onChange={onChange} />
      <span>＋</span>
      <div>
        <b>{title}</b>
        <small>
          {files.length ? `${files.length} selected` : "Select images"}
        </small>
      </div>
    </label>
  );
}
function DataTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: string[][];
  empty: string;
}) {
  return (
    <div className="tableWrap">
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {!rows.length ? (
            <tr>
              <td colSpan={headers.length} className="tableEmpty">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j}>{cell}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function calculateDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getCustomerHealth({
  accountStatus,
  installationStatus,
  outstanding,
  hasExactLocation,
  repairCount,
}: {
  accountStatus?: string | null;
  installationStatus?: string | null;
  outstanding: number;
  hasExactLocation: boolean;
  repairCount: number;
}) {
  const account = (accountStatus || "").toLowerCase();
  const installation = (installationStatus || "").toLowerCase();

  if (account === "overdue" || installation === "terminated") {
    return {
      label: "ACTION REQUIRED",
      tone: "bad",
      reason: "Account or service status needs attention",
    };
  }

  if (outstanding > 0 || !hasExactLocation) {
    return {
      label: "ATTENTION",
      tone: "warn",
      reason: outstanding > 0
        ? "Outstanding balance is present"
        : "Exact customer location is not saved",
    };
  }

  if (installation === "completed" && account === "paid") {
    return {
      label: "HEALTHY",
      tone: "good",
      reason: repairCount ? `${repairCount} service visit${repairCount === 1 ? "" : "s"} recorded` : "Account and installation are in good standing",
    };
  }

  return {
    label: "MONITOR",
    tone: "warn",
    reason: "Review the customer record when convenient",
  };
}

const styles = `
:global(*){box-sizing:border-box}:global(body){margin:0;background:#02070b;color:#e9f7fa;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}:global(a){color:inherit}.clientPage{min-height:100vh;position:relative;overflow:hidden;background:radial-gradient(circle at 80% 8%,rgba(45,210,235,.08),transparent 26%),radial-gradient(circle at 10% 45%,rgba(104,76,220,.06),transparent 25%),#02070b}.pageShell{position:relative;z-index:2;width:min(1440px,calc(100% - 48px));margin:auto;padding:24px 0 70px}.ambient{position:fixed;width:480px;height:480px;border-radius:50%;filter:blur(100px);pointer-events:none;opacity:.16}.ambientOne{right:-250px;top:180px;background:#1ecfe8}.ambientTwo{left:-280px;bottom:-160px;background:#725cff}.topbar{height:52px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(130,220,235,.09);margin-bottom:20px}.backLink{font-size:12px;text-decoration:none;color:#9bc0c8;letter-spacing:.08em;text-transform:uppercase}.backLink:hover{color:#fff}.topbarMeta{font-size:9px;letter-spacing:.18em;color:#557982}.topbarMeta b{color:#a7dbe2}.pulseDot,.statusDot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#50e2bb;box-shadow:0 0 14px rgba(80,226,187,.6);margin-right:8px}.heroCard,.panel,.stat{border:1px solid rgba(123,219,233,.11);background:linear-gradient(145deg,rgba(9,25,31,.86),rgba(4,12,17,.86));box-shadow:0 18px 60px rgba(0,0,0,.18);backdrop-filter:blur(12px)}.heroCard{padding:34px 38px;display:flex;justify-content:space-between;gap:24px;align-items:flex-end;border-radius:18px;position:relative;overflow:hidden}.heroCard:after{content:"";position:absolute;inset:0;background:linear-gradient(100deg,transparent 35%,rgba(62,224,245,.055),transparent 75%);pointer-events:none}.eyebrow,.panelIndex,.stat span,.photoGroupHead span,.resolution>span{font-size:9px;letter-spacing:.18em;color:#5f929b;font-weight:800}.heroCard h1{font-size:clamp(38px,5vw,68px);letter-spacing:-.055em;line-height:.95;margin:12px 0 10px}.heroSub{margin:0;color:#71949c;font-size:13px}.heroSub strong{color:#c4edf2}.heroStatus{text-align:right;min-width:130px;position:relative;z-index:1}.heroStatus span:not(.statusDot){font-weight:700;font-size:14px}.heroStatus small{display:block;color:#4f757d;font-size:8px;letter-spacing:.14em;margin-top:6px}.good{color:#59e0b4!important}.bad{color:#ff7777!important}.warn{color:#ffc96b!important}.statsGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:12px 0}.stat{border-radius:13px;padding:20px}.stat strong{display:block;font-size:21px;margin:8px 0 4px;color:#eafcff}.stat small{color:#52747b;font-size:10px}.warnText{color:#ffc96b!important}.goodText{color:#59e0b4!important}.contentGrid{display:grid;grid-template-columns:1.1fr .9fr;gap:12px;margin:12px 0}.panel{border-radius:16px;padding:25px;margin:12px 0}.contentGrid>.panel,.lowerGrid>.panel{margin:0}.panelHeader{display:flex;gap:13px;align-items:flex-start;margin-bottom:22px}.panelIndex{width:27px;height:27px;display:grid;place-items:center;border:1px solid rgba(83,220,237,.16);border-radius:7px;color:#63c5d2}.panelHeader h2{margin:1px 0 4px;font-size:17px;letter-spacing:-.02em}.panelHeader p{margin:0;color:#52737a;font-size:11px}.detailGrid{display:grid;grid-template-columns:1fr 1fr;gap:0 28px}.detail{padding:13px 0;border-bottom:1px solid rgba(120,210,225,.07)}.detail span{display:block;color:#4d737b;font-size:9px;text-transform:uppercase;letter-spacing:.12em;margin-bottom:6px}.detail b{font-size:13px;color:#cde8eb;font-weight:600;word-break:break-word}.editableDetailGrid{gap:12px 16px}.editableField{display:block;padding:0 0 12px;border-bottom:1px solid rgba(120,210,225,.07);color:#4d737b;font-size:9px;text-transform:uppercase;letter-spacing:.12em;font-weight:800}.editableField>span{display:block;margin-bottom:7px}.editableInputWrap{position:relative}.editableField input{width:100%;background:#071218;border:1px solid rgba(120,220,235,.13);color:#d9f3f5;border-radius:8px;padding:11px 72px 11px 11px;outline:none;font:inherit;font-size:12px;letter-spacing:0;text-transform:none}.editableField input:focus{border-color:rgba(77,222,241,.45);box-shadow:0 0 0 3px rgba(77,222,241,.05)}.editableField small{display:block;margin-top:5px;color:#3f646b;font-size:8px;text-transform:none;letter-spacing:.03em;font-weight:500}.editableField em{position:absolute;right:9px;top:50%;transform:translateY(-50%);font-style:normal;font-size:8px;letter-spacing:.04em;text-transform:uppercase}.editableField em.saving{color:#ffc96b}.editableField em.saved{color:#59e0b4}.editableField em.error{color:#ff7777}.autosaveNote{padding:10px 12px;border:1px solid rgba(89,224,180,.1);border-radius:9px;background:rgba(89,224,180,.025);color:#52757b;font-size:9px}.autosaveNote span{color:#59e0b4;margin-right:6px}.controlStack{display:flex;flex-direction:column;gap:12px}.statusControl{display:flex;justify-content:space-between;gap:15px;align-items:center;padding:15px;border:1px solid rgba(116,210,224,.08);border-radius:10px;background:rgba(0,0,0,.12)}.statusControl span{display:block;font-size:12px;font-weight:700}.statusControl small{display:block;color:#4d7279;font-size:9px;margin-top:4px}.statusRight{display:flex;align-items:center;gap:9px}.statusControl select,.locationForm input,.repairForm input,.repairForm textarea,.repairForm select{background:#071218;border:1px solid rgba(120,220,235,.13);color:#d9f3f5;border-radius:8px;padding:10px 11px;outline:none}.statusControl select:focus,.locationForm input:focus,.repairForm input:focus,.repairForm textarea:focus{border-color:rgba(77,222,241,.45)}.statusControl em{font-style:normal;font-size:9px}.statusControl em.saved{color:#59e0b4}.statusControl em.error{color:#ff7777}.statusControl em.saving{color:#ffc96b}.locationPanel{padding-bottom:28px}.locationTools{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:16px}.locationToolCard{display:flex;align-items:center;gap:12px;padding:14px;border:1px solid var(--line);background:rgba(255,255,255,.025);border-radius:16px}.toolIcon{width:36px;height:36px;flex:0 0 36px;display:grid;place-items:center;border:1px solid var(--line);border-radius:11px;color:var(--accent)}.toolCopy{min-width:0;flex:1;display:grid;gap:3px}.toolCopy b{font-size:12px;letter-spacing:.04em;text-transform:uppercase}.toolCopy small{color:var(--muted);line-height:1.45}.locationDetected{color:var(--good);font-size:10px;letter-spacing:.08em;text-transform:uppercase}.locationError{color:var(--bad);font-size:10px;line-height:1.4}.fieldHint{display:block;margin-top:6px;color:var(--muted);font-size:10px;line-height:1.4}.locationLayout{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(310px,.75fr);gap:18px}.mapFrame{min-height:330px;position:relative;border-radius:12px;overflow:hidden;border:1px solid rgba(120,220,235,.12);background:#061016;box-shadow:inset 0 0 0 1px rgba(255,255,255,.015),0 14px 40px rgba(0,0,0,.22)}.customerLeafletMap{width:100%;height:330px}.customerMapMarkerWrap{background:transparent!important;border:0!important}.customerMapMarker{width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:grid;place-items:center;font-size:11px;font-weight:900;color:#fff;border:2px solid rgba(255,255,255,.9);box-shadow:0 5px 18px rgba(0,0,0,.38)}.customerMapMarker .markerText{transform:rotate(45deg);display:block}.customerMapMarker.areaMarker{background:#246f82}.customerMapMarker.customerMarker{width:38px;height:38px;background:#d34f5b;box-shadow:0 0 0 5px rgba(211,79,91,.18),0 6px 20px rgba(0,0,0,.42)}.leaflet-container{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#071116}.leaflet-popup-content-wrapper,.leaflet-popup-tip{background:#071116;color:#d9f1f3;border:1px solid rgba(120,220,235,.14)}.leaflet-popup-content{font-size:11px;line-height:1.5}.leaflet-popup-content strong{font-size:12px}.leaflet-popup-content span,.leaflet-popup-content small{color:#70939a}.mapFrame iframe{width:100%;height:330px;border:0;display:block;filter:saturate(.75) contrast(1.05)}.mapEmpty{height:330px;display:grid;place-items:center;align-content:center;color:#52747b;gap:7px;text-align:center;padding:24px}.mapEmpty span{font-size:36px;color:#65d8e7}.mapEmpty b{color:#a7cdd2}.mapEmpty small{font-size:10px}.mapStatus{position:absolute;left:10px;top:10px;padding:8px 10px;border-radius:8px;background:rgba(2,9,13,.88);border:1px solid rgba(117,224,238,.17);font-size:8px;letter-spacing:.12em;color:#b9e8ed;backdrop-filter:blur(8px);z-index:2}.mapStatusDot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#59e0b4;box-shadow:0 0 10px rgba(89,224,180,.7);margin-right:6px}.mapOpen{position:absolute;right:10px;bottom:10px;padding:8px 10px;border-radius:7px;background:rgba(2,9,13,.9);border:1px solid rgba(117,224,238,.17);font-size:8px;letter-spacing:.13em;text-decoration:none}.locationForm{display:flex;flex-direction:column;gap:12px}.locationForm label,.repairForm label{font-size:9px;color:#5e858c;letter-spacing:.1em;text-transform:uppercase;font-weight:800}.locationForm input,.repairForm input,.repairForm textarea,.repairForm select{width:100%;margin-top:7px;font:inherit;font-size:12px;letter-spacing:0;text-transform:none}.coordGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.locationHint{display:flex;gap:10px;padding:12px;border-radius:9px;background:rgba(53,204,222,.035);border:1px solid rgba(82,214,232,.08)}.locationHint>span{color:#65d8e7}.locationHint b,.locationHint small{display:block}.locationHint b{font-size:10px;color:#9fc8cd}.locationHint small{font-size:9px;color:#54757c;line-height:1.5;margin-top:3px}.button{display:inline-flex;align-items:center;justify-content:center;border:1px solid rgba(118,221,234,.15);border-radius:8px;background:#08161c;color:#c8ebef;padding:10px 14px;font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;text-decoration:none;cursor:pointer}.button:hover{border-color:rgba(118,221,234,.4);background:#0a1b22}.button:disabled{opacity:.5;cursor:not-allowed}.button.primary{background:linear-gradient(135deg,#123c46,#0b232a);border-color:rgba(79,218,237,.28)}.photoTypeGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.photoGroup{border:1px solid rgba(116,215,229,.08);border-radius:11px;padding:12px;background:rgba(0,0,0,.1)}.photoGroupHead{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:11px}.photoGroupHead b{display:block;font-size:11px}.photoGroupHead small{display:block;color:#4f747b;font-size:9px;margin-top:4px}.photoGroupHead span{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;background:rgba(70,215,232,.07);color:#70d9e7}.photoGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.photoCard{margin:0;aspect-ratio:1;border-radius:7px;overflow:hidden;position:relative;background:#071116;border:1px solid rgba(130,220,230,.08)}.photoCard a,.photoCard img{width:100%;height:100%;display:block}.photoCard img{object-fit:cover}.photoCard button{position:absolute;right:4px;top:4px;width:22px;height:22px;border:0;border-radius:50%;background:rgba(0,0,0,.75);color:#fff;cursor:pointer}.photoCard figcaption{position:absolute;left:0;right:0;bottom:0;padding:5px;background:linear-gradient(transparent,rgba(0,0,0,.8));font-size:7px;color:#b7dce0}.photoBroken{display:grid;place-items:center;height:100%;font-size:8px;color:#55767d}.uploadTile{aspect-ratio:1;border:1px dashed rgba(108,213,228,.18);border-radius:7px;display:grid;place-items:center;align-content:center;cursor:pointer;color:#608b93;text-align:center;position:relative}.uploadTile input,.filePicker input{position:absolute;inset:0;opacity:0;cursor:pointer}.uploadTile span{font-size:24px;color:#65d8e7}.uploadTile b{font-size:9px;margin-top:5px}.uploadTile small{font-size:7px;margin-top:3px}.sectionHeader{display:flex;justify-content:space-between;gap:18px}.repairForm{padding:16px;border:1px solid rgba(118,215,230,.09);background:rgba(0,0,0,.1);border-radius:11px;margin-bottom:18px}.repairFormGrid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:12px}.repairForm textarea{min-height:85px;resize:vertical}.repairForm label+label{display:block;margin-top:12px}.repairUploads{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0}.filePicker{position:relative;display:flex;align-items:center;gap:10px;padding:12px;border:1px dashed rgba(108,213,228,.16);border-radius:8px;cursor:pointer}.filePicker>span{font-size:22px;color:#62d7e5}.filePicker b,.filePicker small{display:block}.filePicker b{font-size:10px;color:#a8d0d5}.filePicker small{font-size:9px;color:#54777e;margin-top:3px}.repairList{display:flex;flex-direction:column;gap:10px}.repairCard{border:1px solid rgba(116,215,229,.08);border-radius:11px;padding:17px;background:rgba(0,0,0,.1)}.repairHead{display:flex;justify-content:space-between;gap:15px}.repairHead h3{font-size:14px;margin:8px 0 4px}.repairHead small{font-size:9px;color:#587980}.tag{font-size:8px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.iconButton{border:0;background:none;color:#52757d;font-size:9px;cursor:pointer}.iconButton:hover{color:#ff7d7d}.resolution{margin-top:13px;padding:12px;border-left:2px solid rgba(78,214,232,.25);background:rgba(70,210,230,.025)}.resolution p{font-size:11px;line-height:1.6;color:#9bbec3;margin:5px 0 0}.repairPhotoStrip{display:flex;gap:7px;margin-top:13px;overflow:auto}.repairPhoto{position:relative;flex:0 0 90px;height:72px;border-radius:6px;overflow:hidden;border:1px solid rgba(120,220,235,.1)}.repairPhoto img{width:100%;height:100%;object-fit:cover}.repairPhoto span{position:absolute;left:4px;bottom:4px;background:rgba(0,0,0,.75);font-size:7px;padding:3px 5px;border-radius:4px;text-transform:uppercase}.lowerGrid{margin-top:12px}.tablePanel{min-width:0}.tableWrap{overflow:auto}.tableWrap table{border-collapse:collapse;width:100%;min-width:560px}.tableWrap th{text-align:left;padding:10px 9px;color:#4f777e;font-size:8px;letter-spacing:.12em;text-transform:uppercase;border-bottom:1px solid rgba(120,215,230,.1)}.tableWrap td{padding:12px 9px;color:#a9cbd0;font-size:10px;border-bottom:1px solid rgba(120,215,230,.055);white-space:nowrap}.tableWrap tr:hover td{background:rgba(77,214,233,.025)}.tableEmpty{text-align:center!important;color:#52737a!important;padding:28px!important}.empty{display:flex;align-items:center;justify-content:center;gap:13px;padding:30px;color:#52747b}.empty>span{font-size:24px;color:#63cbd9}.empty b,.empty small{display:block}.empty b{font-size:11px;color:#89adb3}.empty small{font-size:9px;margin-top:4px}.auditList{display:flex;flex-direction:column}.auditRow{display:grid;grid-template-columns:10px 1fr auto;gap:12px;align-items:start;padding:13px 0;border-bottom:1px solid rgba(120,215,230,.06)}.auditLine{width:5px;height:5px;border-radius:50%;background:#5ed9e8;box-shadow:0 0 9px rgba(94,217,232,.5);margin-top:5px}.auditRow b{font-size:10px}.auditRow p{margin:4px 0 0;font-size:9px;color:#54767d}.auditRow p span{color:#6ad7e3;padding:0 4px}.auditRow time{font-size:8px;color:#58777e;text-align:right}.auditRow time small{display:block;margin-top:3px}.notice{position:sticky;top:12px;z-index:10;margin:0 0 12px;padding:11px 14px;border:1px solid rgba(86,216,232,.18);background:rgba(5,24,30,.94);border-radius:9px;color:#a8d9de;font-size:10px;display:flex;justify-content:space-between;gap:10px}.notice button{background:none;border:0;color:#73a0a7;font-size:15px;cursor:pointer}.statePage{min-height:100vh;display:grid;place-items:center;background:#02070b;color:#b9dce1}.stateCard{width:min(450px,calc(100% - 40px));padding:30px;border:1px solid rgba(110,215,230,.12);border-radius:14px;background:#061117}.stateCard b,.stateCard p{display:block}.stateCard p{color:#6b8d94;font-size:12px;line-height:1.5}.stateCard .button{margin-top:10px}.loader{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#5f858c}.loader span{display:inline-block;width:8px;height:8px;border-radius:50%;background:#5ddbe8;box-shadow:0 0 18px #5ddbe8;margin-right:9px;animation:pulse 1s infinite alternate}@keyframes pulse{to{opacity:.25;transform:scale(.7)}}.footer{display:flex;justify-content:space-between;padding-top:24px;color:#385960;font-size:8px;letter-spacing:.16em}.footer span:last-child{color:#2e4a50}
.locationTools{grid-template-columns:1fr}.locationToolCard{align-items:flex-start}\n@media(max-width:1000px){.statsGrid{grid-template-columns:repeat(3,1fr)}.contentGrid,.locationLayout{grid-template-columns:1fr}.photoTypeGrid{grid-template-columns:1fr}.lowerGrid{grid-template-columns:1fr}.mapFrame,.mapFrame iframe,.customerLeafletMap{min-height:300px;height:300px}}
.quickActions{display:flex;flex-wrap:wrap;gap:7px;margin-top:18px;position:relative;z-index:1}.quickAction{display:inline-flex;align-items:center;gap:6px;padding:8px 10px;border:1px solid rgba(118,221,234,.13);border-radius:8px;background:rgba(3,14,19,.6);color:#9fcbd0;font-size:8px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;text-decoration:none;cursor:pointer}.quickAction:hover{border-color:rgba(118,221,234,.38);color:#e5fbfd;background:rgba(12,35,42,.8)}.quickAction span{color:#65d8e7;font-size:11px}.healthBadge{display:inline-flex;align-items:center;gap:6px;margin-top:13px;padding:6px 9px;border-radius:999px;border:1px solid rgba(255,255,255,.08);font-size:8px;font-weight:900;letter-spacing:.1em}.healthBadge i{width:6px;height:6px;border-radius:50%;display:inline-block}.healthBadge.good{color:#59e0b4!important;background:rgba(89,224,180,.06);border-color:rgba(89,224,180,.16)}.healthBadge.good i{background:#59e0b4;box-shadow:0 0 8px #59e0b4}.healthBadge.warn{color:#ffc96b!important;background:rgba(255,201,107,.06);border-color:rgba(255,201,107,.16)}.healthBadge.warn i{background:#ffc96b;box-shadow:0 0 8px #ffc96b}.healthBadge.bad{color:#ff7777!important;background:rgba(255,119,119,.06);border-color:rgba(255,119,119,.16)}.healthBadge.bad i{background:#ff7777;box-shadow:0 0 8px #ff7777}.healthReason{display:block!important;max-width:190px;margin-top:5px!important;color:#55777e!important;font-size:8px!important;line-height:1.35}.statsGrid{grid-template-columns:repeat(6,1fr)}.stat{min-width:0}.stat strong{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.locationMetric{display:inline-flex;width:max-content;max-width:100%;color:#9dcdd2;font-size:9px;letter-spacing:.04em}.locationPending{color:#ffc96b;font-size:9px;letter-spacing:.08em}.miniButton{border:1px solid rgba(118,221,234,.15);background:#08161c;color:#9ed0d5;border-radius:7px;padding:7px 8px;font-size:8px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;cursor:pointer}.miniButton:hover{border-color:rgba(118,221,234,.4);color:#fff}.mapLegend{position:absolute;right:10px;top:10px;z-index:2;display:flex;gap:8px;padding:7px 9px;border:1px solid rgba(117,224,238,.13);border-radius:8px;background:rgba(2,9,13,.88);backdrop-filter:blur(8px);font-size:8px;color:#9cc8ce}.mapLegend span{display:flex;align-items:center;gap:5px}.mapLegend i{width:7px;height:7px;border-radius:50%;display:inline-block}.legendArea{background:#4eafc0}.legendCustomer{background:#d34f5b;box-shadow:0 0 7px rgba(211,79,91,.7)}.photoOpen{position:absolute;inset:0;border:0;padding:0;background:none;cursor:zoom-in}.photoOpen img{transition:transform .22s ease}.photoCard:hover .photoOpen img{transform:scale(1.045)}.lightbox{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:28px;background:rgba(0,4,7,.86);backdrop-filter:blur(12px)}.lightboxPanel{position:relative;width:min(1000px,94vw);max-height:92vh;display:flex;flex-direction:column;gap:10px;padding:12px;border:1px solid rgba(123,219,233,.18);border-radius:16px;background:#061116;box-shadow:0 30px 100px rgba(0,0,0,.55)}.lightboxPanel>img{width:100%;max-height:78vh;object-fit:contain;border-radius:10px;background:#02070b}.lightboxClose{position:absolute;right:20px;top:20px;z-index:2;width:34px;height:34px;border:1px solid rgba(255,255,255,.15);border-radius:50%;background:rgba(0,0,0,.7);color:#fff;font-size:22px;line-height:1;cursor:pointer}.lightboxMeta{display:flex;justify-content:space-between;gap:15px;padding:4px 6px 2px;color:#789da4;font-size:9px}.lightboxMeta b{color:#c4e8ec;font-size:11px}.lightboxMeta span{align-self:center}
@media(max-width:650px){.pageShell{width:min(100% - 24px,1440px);padding-top:12px}.topbarMeta{display:none}.heroCard{padding:24px 20px;align-items:flex-start;flex-direction:column}.heroStatus{text-align:left}.statsGrid{grid-template-columns:1fr 1fr;gap:8px}.stat{padding:15px}.stat strong{font-size:16px}.panel{padding:18px}.detailGrid{grid-template-columns:1fr}.repairFormGrid,.repairUploads{grid-template-columns:1fr}.sectionHeader{align-items:flex-start;flex-direction:column}.photoGrid{grid-template-columns:repeat(3,1fr)}.coordGrid{grid-template-columns:1fr}.footer{flex-direction:column;gap:8px}.auditRow{grid-template-columns:8px 1fr}.auditRow time{grid-column:2;text-align:left}.statusControl{align-items:flex-start;flex-direction:column}.quickActions{width:100%}.heroStatus{min-width:0}.mapLegend{left:10px;right:auto;top:auto;bottom:10px}.mapStatus{top:10px}.statusRight{width:100%}.statusControl select{flex:1}.statusRight{justify-content:space-between}}
`;
