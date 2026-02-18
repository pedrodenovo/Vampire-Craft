import { world, system } from "@minecraft/server";
import { ActionFormData, MessageFormData } from "@minecraft/server-ui";

// ==========================================
// 1. DATA SCHEMA: ÁRVORES DE HABILIDADE E CUSTOS
// ==========================================

const SKILL_TREES = {
    "vampire": [
        { 
            id: "bat_swarm", name: "Enxame de Morcegos", parent: null,
            costs: [{ item: "sunrise:blood_bottle_human", amount: 5 }]
        },
        { 
            id: "leech_strike", name: "Golpe Sanguessuga", parent: "bat_swarm",
            costs: [{ item: "sunrise:blood_bottle_human", amount: 10 }, { item: "sunrise:vampiric_dust", amount: 2 }]
        },
        { 
            id: "sun_walker", name: "Maestria: Caminhante do Sol", parent: "leech_strike",
            costs: [{ item: "sunrise:hunter_badge", amount: 5 }, { item: "sunrise:vampire_heart", amount: 1 }]
        }
    ],
    "werewolf": [
        { 
            id: "devastating_jump", name: "Pulo Devastador", parent: null,
            costs: [{ item: "sunrise:raw_alpha_meat", amount: 8 }]
        },
        { 
            id: "howl", name: "Uivo Aterrorizante", parent: "devastating_jump",
            costs: [{ item: "sunrise:moonstone_shard", amount: 4 }, { item: "minecraft:bone", amount: 32 }]
        },
        { 
            id: "daylight_transformation", name: "Maestria: Controle Alfa", parent: "howl",
            costs: [{ item: "sunrise:direwolf_fang", amount: 3 }, { item: "sunrise:moonstone_shard", amount: 10 }]
        }
    ],
    "witcher": [
        { 
            id: "frost_shot", name: "Disparo Gélido", parent: null,
            costs: [{ item: "sunrise:lesser_mutagen", amount: 5 }]
        },
        { 
            id: "alchemical_blade", name: "Lâmina Alquímica", parent: "frost_shot",
            costs: [{ item: "sunrise:greater_mutagen", amount: 2 }, { item: "sunrise:alchemical_base", amount: 15 }]
        }
    ]
};

// ==========================================
// 2. GATILHOS DE UI
// ==========================================

// Gatilho 1: Altar de Sangue (Bloco)
world.afterEvents.playerInteractWithBlock.subscribe((ev) => {
    const { player, block } = ev;
    
    if (block.typeId === "sunrise:blood_altar") {
        if (player.hasTag("vampire")) {
            showSkillTree(player, "vampire");
        } else if (player.hasTag("werewolf")) {
            showSkillTree(player, "werewolf");
        } else {
            player.sendMessage("§cO altar rejeita sua presença.");
        }
    }
});

// Gatilho 2: Grimório da Mudança (Item)
world.afterEvents.itemUse.subscribe((ev) => {
    const { source: player, itemStack } = ev;
    
    if (itemStack.typeId === "sunrise:grimoire_of_change") {
        if (player.hasTag("witcher")) {
            showSkillTree(player, "witcher");
        } else {
            player.sendMessage("§cAs runas são incompreensíveis para você.");
        }
    }
});

// ==========================================
// 3. MOTOR DE TRANSAÇÃO (VIA COMANDOS SÍNCRONOS)
// ==========================================

function processTransaction(player, costs) {
    // Fase 1: Validação Rigorosa (All-or-Nothing)
    // O seletor hasitem verifica a presença e a quantidade mínima exata.
    for (const cost of costs) {
        try {
            const checkCmd = player.runCommand(`testfor @s[hasitem={item="${cost.item}",quantity=${cost.amount}..}]`);
            if (checkCmd.successCount < 1) return false; 
        } catch (e) {
            // Se o runCommand falhar em encontrar o alvo, ele lança uma exceção.
            // Retornamos falso silenciosamente, bloqueando a compra.
            return false;
        }
    }

    // Fase 2: Execução e Limpeza (Clear)
    // Usamos 0 como data_value para cobrir o item base.
    for (const cost of costs) {
        try {
            player.runCommand(`clear @s "${cost.item}" 0 ${cost.amount}`);
        } catch (e) {
            console.error(`[Erro de Transação Crítico] Falha ao limpar ${cost.item} do jogador ${player.name}.`);
            return false;
        }
    }

    return true; // Transação concluída
}

// ==========================================
// 4. RENDERIZAÇÃO DE INTERFACE
// ==========================================

function showSkillTree(player, classId) {
    const tree = SKILL_TREES[classId];
    const form = new ActionFormData()
        .title(`§4Árvore de Habilidades`)
        .body("Selecione um conhecimento para absorver:");

    tree.forEach(skill => {
        const isUnlocked = player.hasTag(`skill_${skill.id}`);
        const status = isUnlocked ? "§2[Desbloqueado]§r" : "§8[Bloqueado]§r";
        form.button(`${status} ${skill.name}`);
    });

    form.show(player).then(response => {
        if (response.canceled) return;
        
        const selectedSkill = tree[response.selection];
        
        if (player.hasTag(`skill_${selectedSkill.id}`)) {
            player.sendMessage("§eVocê já domina este conhecimento.");
            return;
        }

        if (selectedSkill.parent !== null && !player.hasTag(`skill_${selectedSkill.parent}`)) {
            player.sendMessage(`§cRequisito não atendido: Desbloqueie a habilidade anterior primeiro.`);
            return;
        }

        showPurchaseConfirmation(player, selectedSkill);
    }).catch(e => console.error(e));
}

function showPurchaseConfirmation(player, skill) {
    let costText = "§eCustos da Transmutação:\n\n";
    skill.costs.forEach(c => {
        const cleanName = c.item.replace("sunrise:", "").replace("minecraft:", "").replace(/_/g, " ");
        costText += `§7- ${c.amount}x ${cleanName.toUpperCase()}\n`;
    });

    const form = new MessageFormData()
        .title(`Desbloquear ${skill.name}?`)
        .body(costText)
        .button1("§cCancelar")
        .button2("§2Confirmar e Pagar");

    form.show(player).then(response => {
        if (response.canceled || response.selection === 0) return;

        const transactionSuccess = processTransaction(player, skill.costs);

        if (transactionSuccess) {
            player.addTag(`skill_${skill.id}`);
            player.playSound("random.levelup", { volume: 1.0 });
            player.sendMessage(`§aVocê desbloqueou: ${skill.name}!`);
        } else {
            player.playSound("note.bass", { volume: 1.0 });
            player.sendMessage("§cRecursos insuficientes no inventário.");
        }
    }).catch(e => console.error(e));
}
