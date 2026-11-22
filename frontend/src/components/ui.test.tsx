import { render, screen } from "@testing-library/react";
import { CategoryBars, ScorePill, ScoreRing } from "./ui";

test("category bars show n/a for areas that were not asked", () => {
  render(<CategoryBars scores={{ python: 80, sql: null, communication: 65 }} />);
  expect(screen.getByRole("progressbar", { name: "Python" })).toHaveAttribute("aria-valuenow", "80");
  expect(screen.getAllByText("n/a").length).toBeGreaterThan(0);
  expect(screen.getByText("65%")).toBeInTheDocument();
});

test("score ring and pill expose accessible values", () => {
  render(<><ScoreRing value={72} label="overall" /><ScorePill value={6.5} outOf={10} /></>);
  expect(screen.getByRole("img", { name: "overall: 72%" })).toBeInTheDocument();
  expect(screen.getByText("6.5/10")).toBeInTheDocument();
});
