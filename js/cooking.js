import { supabase } from './supabase-client.js';
import { getRecipeById } from './recipes.js';

let currentStepIndex = 0;
let steps = [];
let timerInterval = null;
let timerSeconds = 0;

export async function initCooking() {
    const id = window.currentRecipeId;
    if (!id) { window.navigateTo('dashboard'); return; }

    const { data: recipe, error } = await getRecipeById(id);
    if (error || !recipe) { window.navigateTo('dashboard'); return; }

    steps = recipe.preparation_steps.sort((a, b) => a.step_number - b.step_number);
    currentStepIndex = 0;
    timerSeconds = 0;

    // UI Initial State
    document.getElementById('cooking-recipe-name').textContent = recipe.name_es;
    document.getElementById('cooking-servings').textContent = `${recipe.servings} porc.`;
    document.getElementById('cooking-total-steps').textContent = steps.length;

    renderIngredients(recipe.ingredients);
    renderStep();

    // Bindings
    document.getElementById('btn-cooking-back').addEventListener('click', () => window.navigateTo('recipe-details'));
    document.getElementById('btn-next-step').addEventListener('click', nextStep);
    document.getElementById('btn-prev-step').addEventListener('click', prevStep);
    document.getElementById('btn-cooking-timer-toggle').addEventListener('click', toggleTimer);
    document.getElementById('btn-cooking-done').addEventListener('click', finishCooking);
    document.getElementById('btn-finish-cooking').addEventListener('click', finishCooking);
}

function renderStep() {
    const step = steps[currentStepIndex];
    if (!step) return;

    document.getElementById('cooking-step-badge').textContent = `Paso ${step.step_number}`;
    document.getElementById('cooking-step-text').textContent = step.instruction_es;
    document.getElementById('cooking-current-step').textContent = currentStepIndex + 1;

    // Timer per step if available
    const timeEl = document.getElementById('cooking-step-time');
    if (step.time_minutes) {
        timeEl.classList.remove('hidden');
        document.getElementById('cooking-step-minutes').textContent = `${step.time_minutes} min`;
    } else {
        timeEl.classList.add('hidden');
    }

    // Nav buttons
    document.getElementById('btn-prev-step').disabled = currentStepIndex === 0;
    const nextBtn = document.getElementById('btn-next-step');
    const finishBtn = document.getElementById('btn-finish-cooking');

    if (currentStepIndex === steps.length - 1) {
        nextBtn.classList.add('hidden');
        finishBtn.classList.remove('hidden');
    } else {
        nextBtn.classList.remove('hidden');
        finishBtn.classList.add('hidden');
    }

    renderDots();
}

function nextStep() {
    if (currentStepIndex < steps.length - 1) {
        currentStepIndex++;
        renderStep();
    }
}

function prevStep() {
    if (currentStepIndex > 0) {
        currentStepIndex--;
        renderStep();
    }
}

function renderIngredients(ingredients) {
    const list = document.getElementById('cooking-ingredients-list');
    if (!list) return;

    list.innerHTML = ingredients.map(ing => `
        <li class="cooking-ingredient-item">
            <div class="cooking-ingredient-check" onclick="this.classList.toggle('checked')"></div>
            <span>${ing.name_es} ${ing.quantity ? `— ${ing.quantity} ${ing.unit_es || ''}` : ''}</span>
        </li>
    `).join('');
}

function renderDots() {
    const container = document.getElementById('cooking-dots');
    if (!container) return;

    container.innerHTML = steps.map((_, i) => `
        <div class="cooking-dot ${i === currentStepIndex ? 'cooking-dot--active' : ''}"></div>
    `).join('');
}

function toggleTimer() {
    const btn = document.getElementById('btn-cooking-timer-toggle');
    const icon = document.getElementById('timer-icon');

    if (timerInterval) {
        // Stop
        clearInterval(timerInterval);
        timerInterval = null;
        icon.textContent = 'play_arrow';
    } else {
        // Start
        icon.textContent = 'pause';
        timerInterval = setInterval(() => {
            timerSeconds++;
            updateTimerUI();
        }, 1000);
    }
}

function updateTimerUI() {
    const mins = Math.floor(timerSeconds / 60);
    const secs = timerSeconds % 60;
    document.getElementById('cooking-timer').textContent =
        `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

async function finishCooking() {
    if (timerInterval) clearInterval(timerInterval);

    // Incrementar contador en la BD
    const id = window.currentRecipeId;
    if (id) {
        await supabase.rpc('increment_times_cooked', { recipe_id: id });
    }

    window.navigateTo('dashboard');
}
