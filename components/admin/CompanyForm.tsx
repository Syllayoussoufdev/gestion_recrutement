"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Building2, Upload, Trash2, Plus, ArrowLeft, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export interface ContactItem {
  id?: string;
  firstName: string;
  lastName: string;
  position?: string | null;
  email?: string | null;
  phone?: string | null;
  isPrimary: boolean;
}

export interface CompanyFormData {
  id?: string;
  name: string;
  sector?: string | null;
  siret?: string | null;
  address?: string | null;
  city?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  logoPublicId?: string | null;
  contacts: ContactItem[];
}

interface CompanyFormProps {
  initialData?: CompanyFormData;
  isEdit?: boolean;
}

export default function CompanyForm({ initialData, isEdit = false }: CompanyFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialData?.name || "");
  const [sector, setSector] = useState(initialData?.sector || "");
  const [siret, setSiret] = useState(initialData?.siret || "");
  const [address, setAddress] = useState(initialData?.address || "");
  const [city, setCity] = useState(initialData?.city || "");
  const [website, setWebsite] = useState(initialData?.website || "");
  const [logoUrl, setLogoUrl] = useState(initialData?.logoUrl || "");
  const [logoPublicId, setLogoPublicId] = useState(initialData?.logoPublicId || "");
  const [contacts, setContacts] = useState<ContactItem[]>(
    initialData?.contacts && initialData.contacts.length > 0
      ? initialData.contacts
      : [
          {
            firstName: "",
            lastName: "",
            position: "",
            email: "",
            phone: "",
            isPrimary: true,
          },
        ]
  );

  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Veuillez sélectionner un fichier image valide (PNG, JPG, WEBP, SVG).");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("L'image ne doit pas dépasser 5 Mo.");
      return;
    }

    setUploadingLogo(true);
    setError(null);

    try {
      // 1. Obtenir la signature serveur
      const sigRes = await fetch("/api/admin/cloudinary/signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!sigRes.ok) {
        throw new Error("Impossible d'obtenir la signature Cloudinary.");
      }

      const sigData = await sigRes.json();

      // 2. Upload direct vers Cloudinary
      const formData = new FormData();
      formData.append("file", file);
      formData.append("api_key", sigData.apiKey);
      formData.append("timestamp", sigData.timestamp.toString());
      formData.append("signature", sigData.signature);
      formData.append("folder", sigData.folder);

      const uploadRes = await fetch(
        `https://api.cloudinary.com/v1_1/${sigData.cloudName}/image/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!uploadRes.ok) {
        throw new Error("Échec du téléversement vers Cloudinary.");
      }

      const uploadJson = await uploadRes.json();
      setLogoUrl(uploadJson.secure_url);
      setLogoPublicId(uploadJson.public_id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur lors de l'upload du logo.";
      setError(msg);
    } finally {
      setUploadingLogo(false);
    }
  }

  function addContact() {
    setContacts([
      ...contacts,
      {
        firstName: "",
        lastName: "",
        position: "",
        email: "",
        phone: "",
        isPrimary: contacts.length === 0,
      },
    ]);
  }

  function removeContact(index: number) {
    const updated = contacts.filter((_, idx) => idx !== index);
    // Si on supprime le primary, attribuer au premier restant
    if (updated.length > 0 && !updated.some((c) => c.isPrimary)) {
      updated[0].isPrimary = true;
    }
    setContacts(updated);
  }

  function updateContact(index: number, field: keyof ContactItem, value: unknown) {
    const updated = [...contacts];
    if (field === "isPrimary") {
      updated.forEach((c, idx) => {
        c.isPrimary = idx === index;
      });
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    setContacts(updated);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Le nom de l'entreprise est obligatoire.");
      return;
    }

    if (siret && siret.trim() && !/^[0-9]{14}$/.test(siret.trim())) {
      setError("Le SIRET doit comporter exactement 14 chiffres.");
      return;
    }

    // Filtrer les contacts vides
    const validContacts = contacts.filter(
      (c) => c.firstName.trim() || c.lastName.trim() || c.email?.trim()
    );

    for (const c of validContacts) {
      if (!c.firstName.trim() || !c.lastName.trim()) {
        setError("Chaque contact renseigné doit comporter au moins un prénom et un nom.");
        return;
      }
    }

    setSaving(true);

    const payload = {
      name: name.trim(),
      sector: sector.trim() || null,
      siret: siret.trim() || null,
      address: address.trim() || null,
      city: city.trim() || null,
      website: website.trim() || null,
      logoUrl: logoUrl || null,
      logoPublicId: logoPublicId || null,
      contacts: validContacts,
    };

    try {
      const url = isEdit
        ? `/api/admin/entreprises/${initialData?.id}`
        : "/api/admin/entreprises";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Une erreur est survenue lors de l'enregistrement.");
        setSaving(false);
        return;
      }

      router.push(`/admin/entreprises/${json.id}`);
      router.refresh();
    } catch {
      setError("Erreur réseau. Impossible de contacter le serveur.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Retour & Titre */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href="/admin/entreprises">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {isEdit ? "Modifier l'entreprise" : "Nouvelle entreprise"}
          </h1>
          <p className="text-sm text-slate-500">
            {isEdit
              ? "Mettez à jour les informations de l'entreprise cliente."
              : "Créez une nouvelle fiche entreprise dans votre cabinet."}
          </p>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {/* Informations générales */}
      <Card>
        <CardHeader>
          <CardTitle>Informations générales</CardTitle>
          <CardDescription>
            Identité légale et coordonnées de l&apos;entreprise cliente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="companyName">Nom de l&apos;entreprise *</Label>
              <Input
                id="companyName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: TechCorp SA"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="companySector">Secteur d&apos;activité</Label>
              <Input
                id="companySector"
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                placeholder="Ex: Technologies, Agro-alimentaire, Banque..."
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="companySiret">Numéro SIRET (14 chiffres)</Label>
              <Input
                id="companySiret"
                value={siret}
                onChange={(e) => setSiret(e.target.value)}
                placeholder="Ex: 12345678901234"
                maxLength={14}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyWebsite">Site Web</Label>
              <Input
                id="companyWebsite"
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://techcorp.fr"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="companyCity">Ville</Label>
              <Input
                id="companyCity"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Ex: Abidjan, Paris, Dakar..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyAddress">Adresse</Label>
              <Input
                id="companyAddress"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Ex: 15 Boulevard de la République"
              />
            </div>
          </div>

          {/* Logo Cloudinary */}
          <div className="space-y-2 pt-2">
            <Label>Logo de l&apos;entreprise</Label>
            <div className="flex items-center gap-4">
              {logoUrl ? (
                <div className="relative h-16 w-16 overflow-hidden rounded-lg border border-slate-200 bg-white p-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logoUrl}
                    alt="Aperçu logo"
                    className="h-full w-full object-contain"
                  />
                </div>
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-400">
                  <Building2 className="h-6 w-6" />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50">
                  {uploadingLogo ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Téléversement...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-3.5 w-3.5" />
                      <span>{logoUrl ? "Remplacer le logo" : "Choisir un logo"}</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    disabled={uploadingLogo}
                    className="hidden"
                  />
                </label>
                {logoUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setLogoUrl("");
                      setLogoPublicId("");
                    }}
                    className="text-left text-xs text-red-600 hover:underline"
                  >
                    Supprimer le logo
                  </button>
                )}
                <span className="text-[11px] text-slate-400">
                  Format PNG, JPG, WEBP ou SVG (max 5 Mo).
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contacts de l'entreprise */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Contacts de l&apos;entreprise</CardTitle>
            <CardDescription>
              Responsables RH et managers opérationnels rattachés à cette entreprise.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addContact}
            className="flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" />
            <span>Ajouter un contact</span>
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {contacts.map((contact, index) => (
            <div
              key={index}
              className="relative rounded-lg border border-slate-200 bg-slate-50/50 p-4 space-y-3"
            >
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600">
                    Contact #{index + 1}
                  </span>
                  {contact.isPrimary && (
                    <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-medium text-white">
                      Principal
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!contact.isPrimary && (
                    <button
                      type="button"
                      onClick={() => updateContact(index, "isPrimary", true)}
                      className="text-xs text-slate-500 hover:text-slate-900"
                    >
                      Définir comme principal
                    </button>
                  )}
                  {contacts.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeContact(index)}
                      className="h-7 w-7 text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Prénom *</Label>
                  <Input
                    value={contact.firstName}
                    onChange={(e) => updateContact(index, "firstName", e.target.value)}
                    placeholder="Claire"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Nom *</Label>
                  <Input
                    value={contact.lastName}
                    onChange={(e) => updateContact(index, "lastName", e.target.value)}
                    placeholder="Bamba"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs">Poste</Label>
                  <Input
                    value={contact.position || ""}
                    onChange={(e) => updateContact(index, "position", e.target.value)}
                    placeholder="Directrice RH"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Email</Label>
                  <Input
                    type="email"
                    value={contact.email || ""}
                    onChange={(e) => updateContact(index, "email", e.target.value)}
                    placeholder="claire@techcorp.fr"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Téléphone</Label>
                  <Input
                    value={contact.phone || ""}
                    onChange={(e) => updateContact(index, "phone", e.target.value)}
                    placeholder="+225 01020304"
                  />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Boutons d'actions */}
      <div className="flex items-center justify-end gap-3">
        <Button variant="outline" asChild type="button">
          <Link href="/admin/entreprises">Annuler</Link>
        </Button>
        <Button type="submit" disabled={saving || uploadingLogo}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              <span>Enregistrement...</span>
            </>
          ) : (
            <>
              <Check className="h-4 w-4 mr-2" />
              <span>{isEdit ? "Enregistrer les modifications" : "Créer l'entreprise"}</span>
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
