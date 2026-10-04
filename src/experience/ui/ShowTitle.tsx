"use client";

type ShowTitleProps = {
  title: string;
};

/** Track title only — brand lives at the top. */
export function ShowTitle({ title }: ShowTitleProps) {
  return <p className="show-title__line">{title}</p>;
}
