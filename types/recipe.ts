export type RecipeIngredientUsed = {
  name: string;
  quantity: number;
};

export type Recipe = {
  name: string;
  description: string;
  ingredients_used: RecipeIngredientUsed[];
  ingredients_needed: string[];
  steps: string[];
  estimated_minutes: number;
};
