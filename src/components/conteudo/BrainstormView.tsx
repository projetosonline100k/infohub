import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapaAvatarTab } from "./MapaAvatarTab";
import { IdeiasTab } from "./IdeiasTab";

interface BrainstormViewProps {
  clienteId: string;
}

export function BrainstormView({ clienteId }: BrainstormViewProps) {
  return (
    <Tabs defaultValue="mapa" className="w-full">
      <TabsList className="mb-6">
        <TabsTrigger value="mapa">Mapa do avatar</TabsTrigger>
        <TabsTrigger value="ideias">Ideias</TabsTrigger>
      </TabsList>

      <TabsContent value="mapa">
        <MapaAvatarTab clienteId={clienteId} />
      </TabsContent>

      <TabsContent value="ideias">
        <IdeiasTab clienteId={clienteId} />
      </TabsContent>
    </Tabs>
  );
}
