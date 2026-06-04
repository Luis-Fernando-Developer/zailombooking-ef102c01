import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";

interface Combo {
  id: string;
  name: string;
}

interface DeleteComboDialogProps {
  combo: Combo;
  onComboDeleted: () => void;
}

export function DeleteComboDialog({ combo, onComboDeleted }: DeleteComboDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleDelete = async () => {
    setLoading(true);

    try {
      // Delete combo items first
      await supabase
        .from("service_combo_items")
        .delete()
        .eq("combo_id", combo.id);

      // Delete combo
      const { error } = await supabase
        .from("service_combos")
        .delete()
        .eq("id", combo.id);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Combo excluído com sucesso!",
      });

      setOpen(false);
      onComboDeleted();
    } catch (error) {
      console.error("Error deleting combo:", error);
      toast({
        title: "Erro",
        description: "Erro ao excluir combo.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
          <Trash2 className="w-4 h-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir Combo</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja excluir o combo <strong>"{combo.name}"</strong>?
            Esta ação não pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={loading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading ? "Excluindo..." : "Excluir"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
