import { world, system, ItemStack } from "@minecraft/server";

// ==========================================
// 1. CONFIGURAÇÕES (Data-Driven Design)
// ==========================================

const TRANSFORMATION_TIME_MS = 5 * 60 * 1000; // 5 minutos em milissegundos

// Mapa de itens que iniciam a transformação
const TRANSFORMATIONS = {
    "sunrise:vampire_tooth": { tag: "vampire", skillItem: "sunrise:vampire_skill" },
    "sunrise:werewolf_fang": { tag: "werewolf", skillItem: "sunrise:werewolf_skill" },
    "sunrise:verbena_cocktail": { tag: "witcher", skillItem: "sunrise:witcher_skill" }
};

// Mapa de itens que curam a transformação
const CURES = {
    "sunrise:vampirism_cure": { tag: "vampire", skillItem: "sunrise:vampire_skill" },
    "sunrise:lycanthropy_cure": { tag: "werewolf", skillItem: "sunrise:werewolf_skill" },
    "sunrise:witcher_cure": { tag: "witcher", skillItem: "sunrise:witcher_skill" }
};

// ==========================================
// 2. FUNÇÕES DE ESTADO
// ==========================================

function clearTransformationState(player) {
    player.setDynamicProperty("sunrise:transform_class", undefined);
    player.setDynamicProperty("sunrise:transform_end", undefined);
}

function hasAnyClass(player) {
    return player.hasTag("vampire") || player.hasTag("werewolf") || player.hasTag("witcher");
}

// ==========================================
// 3. EVENTOS DO JOGADOR
// ==========================================

// Iniciar Transformação ou Curar
world.afterEvents.itemUse.subscribe((ev) => {
    const { source: player, itemStack } = ev;
    if (player.typeId !== "minecraft:player") return;

    const itemId = itemStack.typeId;

    // A. Lógica de Transformação
    if (TRANSFORMATIONS[itemId]) {
        // Validações de sanidade
        if (hasAnyClass(player)) {
            player.sendMessage("§cVocê já pertence a uma classe!");
            return;
        }
        if (player.getDynamicProperty("sunrise:transform_class")) {
            player.sendMessage("§eSua transformação já está em andamento...");
            return;
        }

        const config = TRANSFORMATIONS[itemId];
        const endTime = Date.now() + TRANSFORMATION_TIME_MS;

        player.setDynamicProperty("sunrise:transform_class", itemId);
        player.setDynamicProperty("sunrise:transform_end", endTime);
        player.sendMessage(`§aO processo começou. Você tem 5 minutos. Beba leite ou morra para cancelar.`);
        
        // Aqui você consumiria o item se não for um consumível nativo (opcional)
    }

    // B. Lógica de Cura
    if (CURES[itemId]) {
        const cureData = CURES[itemId];
        if (player.hasTag(cureData.tag)) {
            player.removeTag(cureData.tag);
            
            // Remover item de skill (requer varredura no inventário)
            const inventory = player.getComponent("inventory").container;
            for (let i = 0; i < inventory.size; i++) {
                const item = inventory.getItem(i);
                if (item && item.typeId === cureData.skillItem) {
                    inventory.setItem(i, undefined); // Deleta o item de skill
                }
            }
            player.sendMessage("§bVocê foi curado.");
        } else {
            player.sendMessage("§cVocê não possui esta maldição para curar.");
        }
    }
});

// Cancelar bebendo leite (itemCompleteUse detecta quando o jogador termina de comer/beber)
world.afterEvents.itemCompleteUse.subscribe((ev) => {
    const { source: player, itemStack } = ev;
    if (player.typeId !== "minecraft:player") return;

    if (itemStack.typeId === "minecraft:milk_bucket") {
        if (player.getDynamicProperty("sunrise:transform_class")) {
            clearTransformationState(player);
            player.sendMessage("§eTransformação cancelada pelo leite.");
        }
    }
});

// Cancelar ao morrer
world.afterEvents.entityDie.subscribe((ev) => {
    const player = ev.deadEntity;
    if (player.typeId === "minecraft:player" && player.getDynamicProperty("sunrise:transform_class")) {
        clearTransformationState(player);
        // O jogador não consegue ler mensagens enquanto morto da mesma forma, mas o estado está limpo.
    }
});

// ==========================================
// 4. LOOP DE VERIFICAÇÃO (Tick Loop)
// ==========================================

// Roda a cada 20 ticks (1 segundo) para economizar processamento
system.runInterval(() => {
    const now = Date.now();
    
    // Varre todos os jogadores ativos no servidor
    for (const player of world.getPlayers()) {
        const transformClassId = player.getDynamicProperty("sunrise:transform_class");
        
        if (transformClassId) {
            const endTime = player.getDynamicProperty("sunrise:transform_end");
            
            // Verifica se o tempo esgotou
            if (now >= endTime) {
                const config = TRANSFORMATIONS[transformClassId];
                
                // Conclui a transformação
                player.addTag(config.tag);
                
                // Entrega o item de skill
                const inventory = player.getComponent("inventory").container;
                inventory.addItem(new ItemStack(config.skillItem, 1));
                
                player.sendMessage(`§2Transformação concluída! Você agora é um ${config.tag}.`);
                
                // Limpa o estado
                clearTransformationState(player);
            }
        }
    }
}, 20);
